import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
dotenv.config();

const sql = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export default sql;
