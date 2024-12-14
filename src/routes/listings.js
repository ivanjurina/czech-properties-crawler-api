const express = require('express');
const router = express.Router();
const srealityService = require('../services/sreality');
const idnesService = require('../services/idnes');
const { cacheMiddleware, listingsCache } = require('../middleware/cache');

/**
 * @swagger
 * /api/listings:
 *   get:
 *     summary: Get property listings from both SReality and iDNES
 *     description: |
 *       Fetches property listings from both SReality.cz and Reality.iDNES.cz.
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
 *     responses:
 *       200:
 *         description: Combined listings from both sources
 *       500:
 *         description: Server error
 */
router.get('/listings', cacheMiddleware, async (req, res) => {
  try {
    let listings = [];

    if (req.shouldRefreshCache || req.cacheAge > 5 || !req.cache.data.length) {
      console.log('Fetching fresh data from both sources');

      try {
        // Fetch from both sources concurrently
        const [srealityListings, idnesListings] = await Promise.allSettled([
          srealityService.fetchListings(req.query),
          idnesService.fetchListings(req.query)
        ]);

        // Process SReality results
        if (srealityListings.status === 'fulfilled') {
          listings = [...listings, ...srealityListings.value];
          console.log(`Found ${srealityListings.value.length} SReality listings`);
        } else {
          console.error('SReality fetch failed:', srealityListings.reason);
        }

        // Process iDNES results
        if (idnesListings.status === 'fulfilled') {
          listings = [...listings, ...idnesListings.value];
          console.log(`Found ${idnesListings.value.length} iDNES listings`);
        } else {
          console.error('iDNES fetch failed:', idnesListings.reason);
        }

        // Update cache with combined results
        listingsCache.data = listings;
        listingsCache.lastUpdate = new Date();
      } catch (error) {
        console.error('Error fetching listings:', error);
      }
    } else {
      console.log('Using cached data');
      listings = listingsCache.data;
    }

    // Sort combined results by price per meter
    listings.sort((a, b) => (a.pricePerMeter || Infinity) - (b.pricePerMeter || Infinity));

    // Add source statistics
    const stats = {
      total: listings.length,
      sreality: listings.filter(l => l.source === 'sreality').length,
      idnes: listings.filter(l => l.source === 'idnes').length
    };

    res.json({
      listings,
      timestamp: listingsCache.lastUpdate,
      count: listings.length,
      stats,
      searchParams: req.query
    });
  } catch (error) {
    console.error('Error in /api/listings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch listings',
      message: error.message 
    });
  }
});

module.exports = router;