const express = require('express')
const cors = require('cors')

const app = express()

// Route files
const auth = require('./routes/authRoutes');
const users = require('./routes/userRoutes');

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Mount routers
app.use('/api/v1/auth', auth);
app.use('/api/v1/users', users);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

module.exports = app