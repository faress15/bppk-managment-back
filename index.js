DATABASE_URL = 'postgresql://books_owner:LHgyFhA35YKS@ep-delicate-flower-a58vqlxi.us-east-2.aws.neon.tech/books?sslmode=require'

const express = require('express');
const { neon } = require("@neondatabase/serverless");
const app = express();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
});



const port = 3000;
const sql = neon(DATABASE_URL);


// اضافه کردن اطلاعات کاربران به دیتابیس
app.post('/signup', async (request, response) => {
    const { email, password } = request.body;

    // بررسی وجود کاربر
    const user = await sql`SELECT * FROM users WHERE email = ${email};`;
    if (user.length > 0) {
        return response.status(400).send('User already exists');
    }

    // هش کردن رمز عبور
    const hashedPassword = await bcrypt.hash(password, 10);

    // ذخیره کاربر در دیتابیس
    const newUser = await sql`INSERT INTO users (email, password) VALUES (${email}, ${hashedPassword}) RETURNING *;`;
    
    // ارسال کد تایید به ایمیل
    const code = Math.floor(100000 + Math.random() * 900000); // کد تایید 6 رقمی
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'your-email@gmail.com', // ایمیل ارسال‌کننده
            pass: 'your-email-password'   // رمز عبور
        }
    });
    await transporter.sendMail({
        from: 'your-email@gmail.com',
        to: email,
        subject: 'Verification Code',
        text: `Your verification code is: ${code}`
    });

    // ذخیره کد تایید در دیتابیس
    await sql`UPDATE users SET verification_code = ${code} WHERE email = ${email};`;

    response.status(201).send('User registered, verification code sent.');
});

// ورود (Login)
app.post('/login', async (request, response) => {
    const { email, password } = request.body;

    // بررسی وجود کاربر
    const user = await sql`SELECT * FROM users WHERE email = ${email};`;
    if (user.length === 0) {
        return response.status(400).send('User not found');
    }

    // بررسی رمز عبور
    const validPassword = await bcrypt.compare(password, user[0].password);
    if (!validPassword) {
        return response.status(400).send('Invalid password');
    }

    // صدور توکن JWT
    const token = jwt.sign({ userId: user[0].id, email: user[0].email }, 'your-secret-key', { expiresIn: '1h' });

    response.send({ token });
})

app.get('/books', async (request, response) => {
    const books = await sql`select * from books;`;
    response.send(books);

});

app.post('/books', async (request, response) => {
    const created = await sql`INSERT INTO books (title, author, description) VALUES (${request.body.title}, ${request.body.author1}, ${request.body.descriptionInput1});`;
    response.send(created);
});

app.put('/books/:id', async (request, response) => {
    await sql`UPDATE books SET is_read = ${request.body.is_read} WHERE id = ${request.params.id};`;
    const updatedBook = await sql`SELECT * FROM books WHERE id = ${request.params.id};`;
    response.send(updatedBook[0]);
});


app.delete('/books/:id', async (request, response) => {
    const deleted = await sql`delete from books where id = ${request.body.id};`;
    response.send(deleted);
});





app.listen(port, () => console.log(` My App listening at http://localhost:${port}`));



