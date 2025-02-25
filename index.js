require("dotenv").config();
const express = require("express");
const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const app = express();
const port = process.env.PORT || 3000;

const sql = neon(process.env.DATABASE_URL);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تنظیم CORS
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});




app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: "email and password is required" });
    }

    try {
        const user = await sql`SELECT * FROM users WHERE email = ${email} and password = ${password};`;

        if (user.length === 0) {
            return res.status(401).json({ success: false, message: "user not found" });
        }

        const token = jwt.sign({ id: user[0].id, email: user[0].email,  isAdmin: user[0].isadmin }, process.env.JWT_SECRET, { expiresIn: "1h" });

        res.json({ success: true, token});
    } catch (err) {
        res.status(500).json({ success: false, message: "server error" });
    }
});

const crypto = require("crypto");

app.post("/signup", async (req, res) => {
    const { email, password, isAdmin } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    try {
        const existingUser = await sql`SELECT * FROM users WHERE email = ${email};`;
        if (existingUser.length > 0) {
            return res.status(400).json({ success: false, message: "This email already exists" });
        }


        await sql`INSERT INTO users (email, password, isadmin) VALUES (${email}, ${password}, ${isAdmin})`;

        const verificationCode = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // انقضا در 10 دقیقه

        await sql`INSERT INTO verification_codes (email, code, expires_at) VALUES (${email}, ${verificationCode}, ${expiresAt})`;

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Email Verification Code",
            text: `Your verification code is: ${verificationCode}. It will expire in 2 minutes.`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Error sending email:", error);
                return res.status(500).json({ success: false, message: "Error sending verification email" });
            }
            res.json({ success: true, message: "User registered successfully. Verification email sent!" });
        });

    } catch (err) {
        console.error("Error in signup:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/verify-code", async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
        return res.status(400).json({ success: false, message: "Email and code are required" });
    }

    try {
        const result = await sql`SELECT * FROM verification_codes WHERE email = ${email} AND code = ${code}`;
        if (result.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid or expired code" });
        }

        // بررسی زمان انقضا
        const expiresAt = new Date(result[0].expires_at);
        if (expiresAt < new Date()) {
            return res.status(400).json({ success: false, message: "Code has expired" });
        }

        // حذف کد پس از تأیید موفق
        await sql`DELETE FROM verification_codes WHERE email = ${email}`;

        res.json({ success: true, message: "Code verified successfully!" });

    } catch (err) {
        console.error("Error verifying code:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

app.post("/send-verification-code", async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ success: false, message: "Email is required" });
    }

    try {
        // تولید کد تأیید 6 رقمی
        const verificationCode = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // انقضا در 2 دقیقه

        // حذف کدهای قدیمی کاربر و ذخیره کد جدید
        await sql`DELETE FROM verification_codes WHERE email = ${email}`;
        await sql`INSERT INTO verification_codes (email, code, expires_at) VALUES (${email}, ${verificationCode}, ${expiresAt})`;

        // ارسال ایمیل
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Your Verification Code",
            text: `Your verification code is: ${verificationCode}. It will expire in 2 minutes.`,
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error("Error sending email:", error);
                return res.status(500).json({ success: false, message: "Error sending email" });
            }
            res.json({ success: true, message: "Verification code sent successfully!" });
        });

    } catch (err) {
        console.error("Error sending verification code:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});



app.get('/books', async (req, res) => {
    try {
        const books = await sql`SELECT * FROM books;`;
        res.json(books);
    } catch (err) {
        console.error("Error fetching books:", err);
        res.status(500).json({ error: "Server error" });
    }
});


app.post('/books', async (req, res) => {
    const { title, author, description, category, price, published_date } = req.body;

    try {
        const created = await sql`
            INSERT INTO books (title, author, description, category, price, published_date) 
            VALUES (${title}, ${author}, ${description}, ${category}, ${price}, ${published_date})
            RETURNING *;
        `;
        res.status(201).json(created[0]);
    } catch (err) {
        console.error("Error adding book:", err);
        res.status(500).json({ error: "Server error" });
    }
});


app.put('/books/:id', async (req, res) => {
    try {
        const { title, author, description, category, price, published_date } = req.body;

        await sql`
            UPDATE books 
            SET title = ${title}, 
                author = ${author}, 
                description = ${description}, 
                category = ${category}, 
                price = ${price}, 
                published_date = ${published_date}
            WHERE id = ${req.params.id};
        `;

        const updatedBook = await sql`SELECT * FROM books WHERE id = ${req.params.id};`;
        res.json({ success: true, book: updatedBook[0] });
    } catch (error) {
        console.error("Error updating book:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});




app.delete('/books/:id', async (request, response) => {
    try {
        const deleted = await sql`DELETE FROM books WHERE id = ${request.params.id};`;
        response.json({ success: true, message: "Book deleted successfully" });
    } catch (error) {
        console.error("Error deleting book:", error);
        response.status(500).json({ success: false, message: "Server error" });
    }
});







app.listen(port, () => console.log(` My App listening at http://localhost:${port}`));



