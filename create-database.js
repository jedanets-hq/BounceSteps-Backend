#!/usr/bin/env node

const { Client } = require('pg');
require('dotenv').config();

async function createDatabase() {
    console.log('🔧 Creating database if it doesn\'t exist...');
    
    // Connect to postgres database first to create our target database
    const client = new Client({
        host: process.env.DB_HOST || '127.0.0.1',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: 'postgres' // Connect to default postgres database
    });

    try {
        await client.connect();
        console.log('✅ Connected to PostgreSQL server');

        // Check if database exists
        const dbName = process.env.DB_NAME || 'bouncesteps-db';
        const checkDbQuery = `SELECT 1 FROM pg_database WHERE datname = $1`;
        const result = await client.query(checkDbQuery, [dbName]);

        if (result.rows.length === 0) {
            // Database doesn't exist, create it
            console.log(`📊 Creating database: ${dbName}`);
            await client.query(`CREATE DATABASE "${dbName}"`);
            console.log('✅ Database created successfully!');
        } else {
            console.log(`✅ Database ${dbName} already exists`);
        }

    } catch (error) {
        console.error('❌ Error creating database:', error.message);
        process.exit(1);
    } finally {
        await client.end();
    }
}

createDatabase();