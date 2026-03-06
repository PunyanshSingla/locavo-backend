require('dotenv').config()
const http = require('http')
const app = require('./app')
const connectDB = require('./config/db')
const { startCronJobs } = require('./jobs/bookingCronJobs')
const { initSocket } = require('./socket')

const PORT = process.env.PORT || 5000

// Create HTTP server
const server = http.createServer(app)

// Initialize Socket.io
initSocket(server)

// Connect to Database, then start server and cron jobs
connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
  })
  startCronJobs() // MED-05 + MED-07: auto-cancel stale bookings, auto-release payouts
})
