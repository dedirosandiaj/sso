require('dotenv').config();
const { Client } = require('pg');

async function setup() {
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  // Connect to default 'postgres' db to ensure sso_auth exists
  const client1 = new Client({
    host,
    port,
    user,
    password,
    database: 'postgres',
  });

  try {
    await client1.connect();
    console.log('Connected to default postgres database.');
    
    // Check if sso_auth exists
    const res = await client1.query("SELECT 1 FROM pg_database WHERE datname = 'sso_auth'");
    if (res.rowCount === 0) {
      await client1.query('CREATE DATABASE sso_auth');
      console.log('Database sso_auth created successfully.');
    } else {
      console.log('Database sso_auth already exists.');
    }
  } catch (err) {
    console.error('Error creating database:', err);
  } finally {
    await client1.end();
  }

  // Connect to the new 'sso_auth' db to recreate the table
  const client2 = new Client({
    host,
    port,
    user,
    password,
    database: 'sso_auth',
  });

  try {
    await client2.connect();
    console.log('Connected to sso_auth database.');

    // Drop the table if it was created with the wrong schema
    await client2.query('DROP TABLE IF EXISTS users CASCADE');
    console.log('Dropped old users table if it existed.');

    // Create the new table with the requested columns
    const createTableQuery = `
      CREATE TABLE users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        image TEXT,
        role VARCHAR(50) DEFAULT 'user',
        password VARCHAR(255) NOT NULL,
        status BOOLEAN DEFAULT true,
        failed_login_attempts INT DEFAULT 0,
        locked_until TIMESTAMP WITH TIME ZONE NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client2.query(createTableQuery);
    console.log('Table "users" created successfully with the new schema (UUID for id).');

    const createRefreshTableQuery = `
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client2.query(createRefreshTableQuery);
    console.log('Table "refresh_tokens" created successfully.');

    const createBlacklistQuery = `
      CREATE TABLE IF NOT EXISTS token_blacklist (
        id SERIAL PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
        blacklisted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await client2.query(createBlacklistQuery);
    console.log('Table "token_blacklist" created successfully.');
  } catch (err) {
    console.error('Error creating table:', err);
  } finally {
    await client2.end();
  }
}

setup();
