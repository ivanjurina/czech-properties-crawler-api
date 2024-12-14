const axios = require('axios');

class BezRealitkyService {
  constructor() {
    this.axiosInstance = axios.create({
      baseURL: 'https://api.bezrealitky.cz/graphql/',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Language': 'cs',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': 'https://www.bezrealitky.cz',
        'Referer': 'https://www.bezrealitky.cz/'
      }
    });
  }

  async fetchListings(queryParams) {
    try {
      global.broadcastLog('🟦 BezRealitky: Starting fetch process');
      
      const response = await this.searchListings(queryParams);
      if (!response?.data?.data?.listAdverts?.list) {
        global.broadcastLog('🔴 BezRealitky: No listings found in response');
        return [];
      }
      
      const listings = response.data.data.listAdverts.list.map(this.processListing.bind(this)).filter(Boolean);
      global.broadcastLog(`🟦 BezRealitky: Successfully processed ${listings.length} listings`);
      return listings;

    } catch (error) {
      global.broadcastLog(`🔴 BezRealitky Error: ${error.message}`, 'error');
      if (error.response) {
        global.broadcastLog('🔴 BezRealitky Error Response:', JSON.stringify(error.response.data));
      }
      return [];
    }
  }

  async searchListings(queryParams) {
    const variables = {
      limit: 100,
      offset: 0,
      order: "TIMEORDER_DESC",
      locale: "CS",
      offerType: ["PRODEJ"],
      estateType: ["BYT"],
      ownership: ["OSOBNI"],
      priceFrom: parseInt(queryParams.priceFrom) || 5000000,
      priceTo: parseInt(queryParams.priceTo) || 10000000,
      surfaceFrom: parseInt(queryParams.sizeFrom) || 50,
      surfaceTo: parseInt(queryParams.sizeTo) || 100,
      regionOsmIds: [this.getLocationId(queryParams.location)],
      location: "exact",
      currency: "CZK"
    };

    const query = `
      query AdvertList($locale: Locale!, $estateType: [EstateType], $offerType: [OfferType], $ownership: [Ownership], 
        $priceFrom: Int, $priceTo: Int, $surfaceFrom: Int, $surfaceTo: Int, $regionOsmIds: [ID], 
        $limit: Int = 15, $offset: Int = 0, $order: ResultOrder = TIMEORDER_DESC, $currency: Currency) {
        listAdverts(
          offerType: $offerType
          estateType: $estateType
          ownership: $ownership
          priceFrom: $priceFrom
          priceTo: $priceTo
          surfaceFrom: $surfaceFrom
          surfaceTo: $surfaceTo
          regionOsmIds: $regionOsmIds
          limit: $limit
          offset: $offset
          order: $order
          currency: $currency
        ) {
          list {
            id
            uri
            estateType
            offerType
            mainImage {
              url(filter: RECORD_MAIN)
            }
            publicImages(limit: 10) {
              url(filter: RECORD_MAIN)
            }
            address(locale: $locale)
            surface
            price
            currency
            gps {
              lat
              lng
            }
          }
          totalCount
        }
      }
    `;

    return this.axiosInstance.post('', {
      operationName: "AdvertList",
      variables,
      query
    });
  }

  processListing(listing) {
    if (!listing) return null;

    try {
      const images = [];
      if (listing.mainImage?.url) {
        images.push(listing.mainImage.url);
      }
      if (listing.publicImages) {
        images.push(...listing.publicImages.map(img => img.url));
      }

      return {
        id: `bezrealitky-${listing.id}`,
        url: `https://www.bezrealitky.cz${listing.uri}`,
        name: listing.address || 'Untitled Listing',
        location: listing.address || 'Location not specified',
        size: listing.surface || null,
        price: listing.price || null,
        pricePerMeter: listing.surface && listing.price ? Math.round(listing.price / listing.surface) : null,
        images: images,
        coordinates: listing.gps ? {
          lat: listing.gps.lat,
          lng: listing.gps.lng
        } : null,
        timestamp: new Date().toISOString(),
        source: 'bezrealitky'
      };

    } catch (error) {
      global.broadcastLog(`🔴 BezRealitky Error processing listing: ${error.message}`);
      return null;
    }
  }

  getLocationId(location) {
    const locationMap = {
      'praha': 'R435514',
      'brno': 'R442169',
      'ostrava': 'R436453'
    };
    return locationMap[location?.toLowerCase()] || 'R435514';
  }
}

module.exports = new BezRealitkyService();