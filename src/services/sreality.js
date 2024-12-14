const axios = require('axios');
const https = require('https');

class SRealityService {
  constructor() {
    this.axiosInstance = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 15000
    });
  }

  buildSearchParams(queryParams) {
    const params = {
      category_main_cb: 1,      // 1 = Flat/Apartment
      category_type_cb: 1,      // 1 = Sale
      per_page: 300,
      locality_region_id: this.getLocationId(queryParams.location),
      category_sub_cb: '2|3'    // 2 = 2+kk/2+1, 3 = 3+kk/3+1
    };

    // Add size range if provided
    if (queryParams.sizeFrom) {
      params.usable_area_from = queryParams.sizeFrom;
    }
    if (queryParams.sizeTo) {
      params.usable_area_to = queryParams.sizeTo;
    }

    // Add price range if provided
    if (queryParams.priceFrom) {
      params.price_from = queryParams.priceFrom;
    }
    if (queryParams.priceTo) {
      params.price_to = queryParams.priceTo;
    }

    broadcastLog(`🟣 SReality: Search params: ${JSON.stringify(params)}`);
    return params;
  }

  getLocationId(location) {
    const locationMap = {
      'praha': 10,
      'brno': 2,
      'ostrava': 8
    };
    return locationMap[location?.toLowerCase()] || 10;
  }

  processListingData(estate) {
    try {
      // Extract size - first try usable_area
      let size = estate.usable_area;

      // If no usable_area, try to find it in items
      if (!size && estate.items) {
        const sizeItems = estate.items.filter(item => 
          item.name === 'Užitná plocha' || 
          item.name === 'Podlahová plocha' ||
          item.name === 'Plocha podlahová'
        );

        if (sizeItems.length > 0) {
          const sizeText = sizeItems[0].value;
          const sizeMatch = sizeText.match(/(\d+)/);
          if (sizeMatch) {
            size = parseInt(sizeMatch[1], 10);
          }
        }
      }

      // If still no size, try to extract from name
      if (!size && estate.name) {
        const sizeMatch = estate.name.match(/(\d+)\s*m²/);
        if (sizeMatch) {
          size = parseInt(sizeMatch[1], 10);
        }
      }

      // Extract price
      const price = estate.price_czk?.value_raw;

      broadcastLog(`🟣 SReality: Processing listing - Size: ${size}, Price: ${price}, Name: ${estate.name}`);
      
      // Let the API handle the filtering since we're passing the params in the request
      const pricePerMeter = size && price ? Math.round(price / size) : null;

      // Get layout type (2+kk, 3+1, etc.)
      const layoutType = estate.name?.match(/\d\+\d|\d\+kk/i)?.[0]?.toLowerCase() || '';

      // Build URL with all components
      const url = `https://www.sreality.cz/detail/prodej/byt/${layoutType}/${estate.locality_district?.toLowerCase()?.replace(/\s+/g, '-')}/${estate.hash_id}`;

      return {
        id: estate.hash_id,
        url: url,
        name: estate.name,
        location: estate.locality || '',
        size,
        price,
        pricePerMeter,
        images: estate._links?.images?.map(img => img.href) || [],
        timestamp: new Date().toISOString(),
        source: 'sreality'
      };
    } catch (error) {
      broadcastLog(`🔴 SReality Error processing listing: ${error.message}`, 'error');
      return null;
    }
  }

  async fetchListings(queryParams) {
    try {
      broadcastLog(`🟣 SReality: Starting fetch with params: ${JSON.stringify(queryParams)}`);
      let allListings = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        broadcastLog(`🟣 SReality: Fetching page ${page}`);
        const searchParams = {
          ...this.buildSearchParams(queryParams),
          page: page
        };

        const response = await this.axiosInstance.get('https://www.sreality.cz/api/cs/v2/estates', {
          params: searchParams,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });

        broadcastLog(`🟣 SReality: Response status: ${response.status}`);

        if (response.data?._embedded?.estates) {
          broadcastLog(`🟣 SReality: Raw estates count: ${response.data._embedded.estates.length}`);
          
          const pageListings = response.data._embedded.estates
            .map(estate => this.processListingData(estate))
            .filter(listing => listing !== null);

          broadcastLog(`🟣 SReality: Processed listings for page ${page}: ${pageListings.length}`);
          allListings = [...allListings, ...pageListings];

          // Check if there are more pages
          const total = response.data.total || 0;
          hasMore = page * 100 < total && page < 10; // Limit to 10 pages
          if (hasMore) {
            page++;
          } else {
            broadcastLog('🟣 SReality: No more pages available or reached page limit');
          }
        } else {
          broadcastLog('🟣 SReality: No estates found in response');
          hasMore = false;
        }
      }

      broadcastLog(`🟣 SReality: Completed fetch, total listings: ${allListings.length}`);
      return allListings;

    } catch (error) {
      broadcastLog(`🔴 SReality Error: ${error.message}`, 'error');
      throw error;
    }
  }
}

module.exports = new SRealityService();