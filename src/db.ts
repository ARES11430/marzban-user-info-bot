import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.MUM_DB_HOST,
  user: process.env.MUM_DB_USER,
  password: process.env.MUM_DB_PASSWORD,
  database: process.env.MUM_DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;
