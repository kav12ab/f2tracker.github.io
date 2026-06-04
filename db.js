// db.js
import sqlite3InitModule from 'https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@3.43.1/sqlite-wasm/jswasm/sqlite3-bundler-friendly.mjs';

let db;

export async function initDB() {
    try {
        console.log('Loading SQLite Wasm...');
        const sqlite3 = await sqlite3InitModule();
        
        // Initialize an in-memory database
        db = new sqlite3.oo1.DB('/f2tracker.sqlite3', 'ct'); 
        
        // Execute Schema Translation
        db.exec(`
            CREATE TABLE IF NOT EXISTS app_config (
                id TEXT PRIMARY KEY,
                config_data TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS cars (
                vin TEXT PRIMARY KEY,
                kenn TEXT,
                sequence TEXT,
                model TEXT,
                modelYear TEXT,
                currentArea TEXT NOT NULL,
                status TEXT NOT NULL,
                lastUpdated DATETIME NOT NULL,
                tempLocation TEXT,
                visitorHost TEXT,
                temp_va INTEGER DEFAULT 0,
                temp_nva INTEGER DEFAULT 0,
                temp_comment TEXT,
                temp_status TEXT,
                temp_tags TEXT
            );

            CREATE TABLE IF NOT EXISTS car_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                vin TEXT NOT NULL,
                area TEXT NOT NULL,
                status TEXT NOT NULL,
                timestamp DATETIME NOT NULL,
                userId TEXT,
                action TEXT,
                from_location TEXT,
                metrics_va INTEGER,
                metrics_nva INTEGER,
                metrics_comment TEXT,
                metrics_status TEXT,
                metrics_tags TEXT,
                FOREIGN KEY (vin) REFERENCES cars (vin) ON DELETE CASCADE
            );
        `);
        console.log('SQLite Database initialized successfully.');
        return db;
    } catch (err) {
        console.error('Failed to initialize SQLite:', err);
        throw err;
    }
}