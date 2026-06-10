use std::{env, fs, path::PathBuf};

use anyhow::{anyhow, Context, Result};
use input_relay_protocol::{Device, DevicePermissions, HistoryEntry, HistoryMode, HistoryState};
use rusqlite::{params, Connection};
use uuid::Uuid;

pub struct Storage {
    path: PathBuf,
    conn: Option<Connection>,
}

pub struct PersistentState {
    pub devices: Vec<Device>,
    pub history: HistoryState,
}

impl Storage {
    pub fn new() -> Result<Self> {
        let data_dir = env::var_os("INPUT_RELAY_DATA_DIR")
            .map(PathBuf::from)
            .or_else(|| dirs::data_dir().map(|path| path.join("input-relay")))
            .ok_or_else(|| anyhow!("could not resolve a data directory for input-relay"))?;

        Ok(Self {
            path: data_dir.join("input-relay.db"),
            conn: None,
        })
    }

    pub fn database_path(&self) -> &PathBuf {
        &self.path
    }

    pub fn unlock(&mut self, password: &str) -> Result<PersistentState> {
        if password.trim().is_empty() {
            return Err(anyhow!("unlock password cannot be empty"));
        }

        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create data directory {}", parent.display()))?;
        }

        let existed = self.path.exists();
        let conn = Connection::open(&self.path).with_context(|| {
            format!("failed to open encrypted database {}", self.path.display())
        })?;
        apply_key(&conn, password)?;
        ensure_sqlcipher(&conn)?;

        // This query forces SQLCipher to validate the key for existing databases.
        let _user_version: i64 = conn
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .context("failed to unlock database; password may be incorrect")?;

        create_schema(&conn)?;
        if !existed {
            seed_defaults(&conn)?;
        } else {
            seed_missing_defaults(&conn)?;
        }

        let persistent = load_state(&conn)?;
        self.conn = Some(conn);
        Ok(persistent)
    }

    pub fn lock(&mut self) {
        self.conn = None;
    }

    pub fn save_device(&self, device: &Device) -> Result<()> {
        let conn = self.conn()?;
        let permissions_json = serde_json::to_string(&device.permissions)?;
        conn.execute(
            "INSERT INTO devices (id, name, verified, permissions_json)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                verified = excluded.verified,
                permissions_json = excluded.permissions_json",
            params![
                device.id,
                device.name,
                if device.verified { 1 } else { 0 },
                permissions_json
            ],
        )?;
        Ok(())
    }

    pub fn save_permissions(&self, device_id: &str, permissions: &DevicePermissions) -> Result<()> {
        let conn = self.conn()?;
        let permissions_json = serde_json::to_string(permissions)?;
        let changed = conn.execute(
            "UPDATE devices SET permissions_json = ?1 WHERE id = ?2",
            params![permissions_json, device_id],
        )?;
        if changed == 0 {
            return Err(anyhow!("device {device_id} was not found"));
        }
        Ok(())
    }

    pub fn save_history_settings(&self, mode: &HistoryMode, limit: usize) -> Result<()> {
        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO history_settings (id, mode, limit_count)
             VALUES (1, ?1, ?2)
             ON CONFLICT(id) DO UPDATE SET mode = excluded.mode, limit_count = excluded.limit_count",
            params![history_mode_to_str(mode), limit as i64],
        )?;

        if matches!(mode, HistoryMode::None) {
            conn.execute("DELETE FROM history_entries", [])?;
        } else if matches!(mode, HistoryMode::Last) {
            trim_history(conn, limit)?;
        }

        Ok(())
    }

    pub fn add_history_entry(
        &self,
        entry: &HistoryEntry,
        mode: &HistoryMode,
        limit: usize,
    ) -> Result<()> {
        if matches!(mode, HistoryMode::None) {
            return Ok(());
        }

        let conn = self.conn()?;
        conn.execute(
            "INSERT INTO history_entries (id, text, created_at_ms) VALUES (?1, ?2, ?3)",
            params![entry.id.to_string(), entry.text, entry.created_at_ms as i64],
        )?;

        if matches!(mode, HistoryMode::Last) {
            trim_history(conn, limit)?;
        }

        Ok(())
    }

    fn conn(&self) -> Result<&Connection> {
        self.conn
            .as_ref()
            .ok_or_else(|| anyhow!("encrypted storage is locked"))
    }
}

fn apply_key(conn: &Connection, password: &str) -> Result<()> {
    conn.pragma_update(None, "key", password)
        .context("failed to apply SQLCipher key")?;
    Ok(())
}

fn ensure_sqlcipher(conn: &Connection) -> Result<()> {
    let cipher_version = conn
        .query_row("PRAGMA cipher_version", [], |row| row.get::<_, String>(0))
        .context("SQLCipher is not available in the SQLite build")?;

    if cipher_version.trim().is_empty() {
        return Err(anyhow!("SQLCipher reported an empty cipher_version"));
    }

    Ok(())
}

fn create_schema(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            verified INTEGER NOT NULL,
            permissions_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS history_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            mode TEXT NOT NULL,
            limit_count INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS history_entries (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL,
            created_at_ms INTEGER NOT NULL
        );
        ",
    )?;
    Ok(())
}

fn seed_defaults(conn: &Connection) -> Result<()> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES ('schema_version', '1')",
        [],
    )?;
    conn.execute(
        "INSERT INTO history_settings (id, mode, limit_count) VALUES (1, 'none', 10)",
        [],
    )?;
    Ok(())
}

fn seed_missing_defaults(conn: &Connection) -> Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO history_settings (id, mode, limit_count) VALUES (1, 'none', 10)",
        [],
    )?;

    Ok(())
}

fn load_state(conn: &Connection) -> Result<PersistentState> {
    let devices = load_devices(conn)?;

    let (mode, limit) = conn.query_row(
        "SELECT mode, limit_count FROM history_settings WHERE id = 1",
        [],
        |row| {
            let mode_raw: String = row.get(0)?;
            let mode = history_mode_from_str(&mode_raw).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    error.into(),
                )
            })?;
            let limit_raw = row.get::<_, i64>(1)?;
            Ok((mode, limit_raw.max(1) as usize))
        },
    )?;

    let entries = load_history_entries(conn, &mode, limit)?;

    Ok(PersistentState {
        devices,
        history: HistoryState {
            mode,
            limit,
            entries,
        },
    })
}

fn load_devices(conn: &Connection) -> Result<Vec<Device>> {
    let mut statement =
        conn.prepare("SELECT id, name, verified, permissions_json FROM devices ORDER BY name ASC")?;
    let rows = statement.query_map([], device_from_row)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn device_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Device> {
    let permissions_json: String = row.get(3)?;
    let permissions =
        serde_json::from_str::<DevicePermissions>(&permissions_json).map_err(|error| {
            rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, error.into())
        })?;

    Ok(Device {
        id: row.get(0)?,
        name: row.get(1)?,
        verified: row.get::<_, i64>(2)? != 0,
        permissions,
    })
}

fn load_history_entries(
    conn: &Connection,
    mode: &HistoryMode,
    limit: usize,
) -> Result<Vec<HistoryEntry>> {
    if matches!(mode, HistoryMode::None) {
        return Ok(Vec::new());
    }

    if matches!(mode, HistoryMode::Last) {
        let mut statement = conn.prepare(
            "SELECT id, text, created_at_ms FROM history_entries ORDER BY created_at_ms DESC LIMIT ?1",
        )?;
        let rows = statement.query_map(params![limit as i64], history_entry_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    } else {
        let mut statement = conn.prepare(
            "SELECT id, text, created_at_ms FROM history_entries ORDER BY created_at_ms DESC",
        )?;
        let rows = statement.query_map([], history_entry_from_row)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}

fn history_entry_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<HistoryEntry> {
    let id_raw: String = row.get(0)?;
    let id = Uuid::parse_str(&id_raw).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, error.into())
    })?;

    Ok(HistoryEntry {
        id,
        text: row.get(1)?,
        created_at_ms: row.get::<_, i64>(2)?.max(0) as u64,
    })
}

fn trim_history(conn: &Connection, limit: usize) -> Result<()> {
    conn.execute(
        "DELETE FROM history_entries
         WHERE id NOT IN (
            SELECT id FROM history_entries ORDER BY created_at_ms DESC LIMIT ?1
         )",
        params![limit as i64],
    )?;
    Ok(())
}

fn history_mode_to_str(mode: &HistoryMode) -> &'static str {
    match mode {
        HistoryMode::None => "none",
        HistoryMode::Last => "last",
        HistoryMode::All => "all",
    }
}

fn history_mode_from_str(value: &str) -> Result<HistoryMode> {
    match value {
        "none" => Ok(HistoryMode::None),
        "last" => Ok(HistoryMode::Last),
        "all" => Ok(HistoryMode::All),
        other => Err(anyhow!("unknown history mode {other}")),
    }
}
