const srealityService = require('./sreality-service');
const bezrealitkyService = require('./bezrealitky-service');
const remaxService = require('./remax-service');
const idnesService = require('./idnes-service');
const listingProcessor = require('./listing-processor');

class PropertyService {
  async searchProperties(searchParams) {
    console.log('Starting property search across all sources...');

    try {
      // Fetch from all sources in parallel
      const [srealityListings, bezrealitkyListings, remaxListings, idnesListings] = await Promise.all([
        srealityService.fetchListings(searchParams),
        bezrealitkyService.fetchListings(searchParams),
        remaxService.fetchListings(searchParams),
        idnesService.fetchListings(searchParams)
      ]);

      // Combine all listings
      const allListings = [
        ...srealityListings,
        ...bezrealitkyListings,
        ...remaxListings,
        ...idnesListings
      ];

      // Process listings to detect and group duplicates
      const processedListings = listingProcessor.processListings(allListings);

      return processedListings;

    } catch (error) {
      console.error('Error fetching properties:', error);
      return [];
    }
  }
}

module.exports = new PropertyService();
