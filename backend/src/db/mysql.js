import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "sbi_leadgen",

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});


export async function run(sql, params = []) {

    try {

        const [result] = await pool.query(
            sql,
            params
        );

        return {
            lastID: result.insertId,
            changes: result.affectedRows
        };

    } catch(error){

        console.error(
            "MYSQL RUN ERROR:",
            error.message
        );

        throw error;
    }
}



export async function all(sql, params = []) {

    try {

        const [rows] = await pool.query(
            sql,
            params
        );

        return rows;

    } catch(error){

        console.error(
            "MYSQL ALL ERROR:",
            error.message
        );

        throw error;
    }
}



export async function get(sql, params = []) {

    const rows = await all(sql, params);

    return rows[0];

}



export async function testConnection(){

    const connection = await pool.getConnection();

    await connection.ping();

    connection.release();

    console.log("MYSQL CONNECTED");

}



export default pool;