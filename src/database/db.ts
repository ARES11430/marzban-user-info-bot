import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
	host: process.env.MUI_DB_HOST,
	user: process.env.MUI_DB_USER,
	password: process.env.MUI_DB_PASSWORD,
	database: process.env.MUI_DB_NAME,
	waitForConnections: true,
	connectionLimit: 10,
	queueLimit: 0
});

export default pool;
