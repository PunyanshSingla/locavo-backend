require('dotenv').config({path: "../.env"})
const http = require('http')
const app = require('./app')
const connectDB = require('./config/db')

const { initSocket } = require('./socket')

const PORT = process.env.PORT || 5000

// Create HTTP server
const server = http.createServer(app)

// Initialize Socket.io
initSocket(server)

// Connect to Database, then start server
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })

})
