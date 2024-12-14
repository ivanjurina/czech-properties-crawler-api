const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const srealityService = require('./services/sreality');
const idnesService = require('./services/idnes');
const remaxService = require('./services/remax');
const bezrealitkyService = require('./services/bezrealitky');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const swaggerUi = require('swagger-ui-express');
const { swaggerSpec } = require('./config/swagger');


// Setup Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// Middleware
app.use(cors());
app.use(express.json());

// Store active connections
let activeConnections = new Set();

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('Client connected');
  activeConnections.add(ws);

  ws.on('close', () => {
    console.log('Client disconnected');
    activeConnections.delete(ws);
  });
});

// Global broadcast function
global.broadcastLog = (message, type = 'info') => {
  const logMessage = {
    timestamp: new Date().toISOString(),
    message,
    type
  };

  activeConnections.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(logMessage));
    }
  });
};

/**
 * @swagger
 * /api/listings:
 *   get:
 *     summary: Get property listings from multiple sources
 *     description: |
 *       Fetches property listings from SReality, iDNES, and Remax.
 *       Results are cached for 5 minutes unless new parameters are provided.
 *     parameters:
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *           enum: [praha, brno, ostrava]
 *         description: City name (default- praha)
 *       - in: query
 *         name: sizeFrom
 *         schema:
 *           type: string
 *         description: Minimum size in m²
 *       - in: query
 *         name: sizeTo
 *         schema:
 *           type: string
 *         description: Maximum size in m²
 *       - in: query
 *         name: priceFrom
 *         schema:
 *           type: string
 *         description: Minimum price in CZK
 *       - in: query
 *         name: priceTo
 *         schema:
 *           type: string
 *         description: Maximum price in CZK
 */
app.get('/api/listings', async (req, res) => {
  try {
    broadcastLog('Starting property search for selected sources...');
    
    // Get the selected sources from query params
    const selectedSources = req.query.sources ? req.query.sources.split(',') : ['sreality', 'idnes', 'remax', 'bezrealitky'];
    
    // Create a map of source services
    const sourceServices = {
      sreality: srealityService,
      idnes: idnesService,
      remax: remaxService,
      bezrealitky: bezrealitkyService
    };

    // Only fetch from selected sources
    const fetchPromises = selectedSources.map(source => {
      return sourceServices[source].fetchListings(req.query)
        .then(listings => ({
          status: 'fulfilled',
          value: listings
        }))
        .catch(error => ({
          status: 'rejected',
          reason: error.message
        }));
    });

    const results = await Promise.all(fetchPromises);

    let allListings = [];

    // Process results from each selected source
    selectedSources.forEach((source, index) => {
      const result = results[index];
      if (result.status === 'fulfilled') {
        allListings = [...allListings, ...result.value];
        broadcastLog(`✅ ${source}: found ${result.value.length} listings`);
      } else {
        broadcastLog(`❌ ${source} failed: ${result.reason}`, 'error');
      }
    });

    // Calculate statistics
    const stats = {
      total: allListings.length,
      sreality: allListings.filter(l => l.source === 'sreality').length,
      idnes: allListings.filter(l => l.source === 'idnes').length,
      remax: allListings.filter(l => l.source === 'remax').length,
      bezrealitky: allListings.filter(l => l.source === 'bezrealitky').length
    };

    // Log summary
    broadcastLog(`✅ Search completed:
      Total: ${stats.total} listings
      SReality: ${stats.sreality} listings
      iDNES: ${stats.idnes} listings
      Remax: ${stats.remax} listings
      Bezrealitky: ${stats.bezrealitky} listings`
    );

    res.json({
      listings: allListings,
      timestamp: new Date().toISOString(),
      stats,
      count: allListings.length,
      searchParams: req.query
    });

  } catch (error) {
    broadcastLog(`❌ Server error: ${error.message}`, 'error');
    res.status(500).json({
      error: 'Failed to fetch listings',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/health:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the status of the API
 *     responses:
 *       200:
 *         description: Server is healthy
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: ['sreality', 'idnes', 'remax']
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  broadcastLog(`❌ Unhandled server error: ${err.message}`, 'error');
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  broadcastLog(`🚀 Server started on port ${PORT}`);
});

// Handle process errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  broadcastLog(`❌ Uncaught Exception: ${error.message}`, 'error');
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
  broadcastLog(`❌ Unhandled Rejection: ${error.message}`, 'error');
});

module.exports = { app, server };