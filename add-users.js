const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Define the users you want to add.
// IMPORTANT: Change these passwords after the first successful login.
const newUsers = [
    {
        firstName: 'Ndamulelo',
        lastName: 'Sandani',
        email: 'info@stackopsit.co.za',
        companyName: 'Stackops IT Solutions',
        password: '@Ndamulelo1993',
        isActive: 1,
        role: 'Admin'
    },
    {
        firstName: 'Sandani',
        lastName: 'Takalani',
        email: 'takiesandani@gmail.com',
        companyName: 'Stackops IT Solutions',
        password: '@Taki2005',
        isActive: 1,
        role: 'Admin'
    }
];

const main = async () => {
    let pool;
    try {
        // Create a connection pool to the database
        pool = mysql.createPool({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });

        console.log('Database connection pool created.');

        for (const user of newUsers) {
            console.log(`Processing user: ${user.email}...`);

            // Check if the user already exists to prevent duplicates
            const [existingUsers] = await pool.query('SELECT * FROM Users WHERE Email = ?', [user.email]);
            if (existingUsers.length > 0) {
                console.warn(`User with email ${user.email} already exists. Skipping.`);
                continue;
            }

            // Generate a salt and hash the password
            const saltRounds = 10;
            const hashedPassword = await bcrypt.hash(user.password, saltRounds);

            // SQL query to insert the new user
            const sql = `
                INSERT INTO Users 
                (FirstName, LastName, Email, CompanyName, password, isActive, Role) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `;
            const values = [
                user.firstName,
                user.lastName,
                user.email,
                user.companyName,
                hashedPassword,
                user.isActive,
                user.role
            ];

            const [result] = await pool.query(sql, values);
            console.log(`Successfully added user ${user.email}. Insert ID: ${result.insertId}`);
        }

        console.log('All users processed.');
    } catch (error) {
        console.error('An error occurred:', error);
    } finally {
        if (pool) {
            await pool.end();
            console.log('Database connection pool closed.');
        }
    }
};

main();