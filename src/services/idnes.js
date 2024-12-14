const puppeteer = require('puppeteer');

class IDNESService {
  async fetchListings(queryParams) {
    let browser = null;
    try {
      // global.broadcastLog('🔵 iDNES: Starting fetch process with params: ' + JSON.stringify(queryParams));
      let allListings = [];
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      let currentPage = 1;
      let hasNextPage = true;
      const MAX_PAGES = 3; // Limit to 10 pages

      while (hasNextPage && currentPage <= MAX_PAGES) {
        const url = this.buildUrl(queryParams, currentPage);
        global.broadcastLog(`🔵 iDNES: Fetching page ${currentPage}`);

        await page.goto(url);
        
        // Wait for content to load
        try {
          await page.waitForSelector('.c-products__item', { timeout: 5000 });
        } catch (err) {
          global.broadcastLog('🔵 iDNES: No listings found on page');
          break;
        }

        // Add a small delay to ensure dynamic content is loaded
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Extract listings from current page
        const pageListings = await this.extractListings(page);
        // global.broadcastLog(`🔵 iDNES: Found ${pageListings.length} listings on page ${currentPage}`);
        allListings = [...allListings, ...pageListings];

        // Check for next page
        hasNextPage = await this.hasNextPage(page, currentPage);
        if (hasNextPage && currentPage < MAX_PAGES) {
          // global.broadcastLog(`🔵 iDNES: Moving to page ${currentPage + 1}`);
          currentPage++;
          // Add delay between pages
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          global.broadcastLog(`🔵 iDNES: Stopping pagination. Reason: ${currentPage >= MAX_PAGES ? 'Max pages reached' : 'No more pages'}`);
          hasNextPage = false;
        }
      }

      global.broadcastLog(`🔵 iDNES: Completed fetch, total listings: ${allListings.length}`);
      return allListings;

    } catch (error) {
      global.broadcastLog(`🔴 iDNES Error: ${error.message}`, 'error');
      return []; // Return empty array instead of throwing
    } finally {
      if (browser) {
        await browser.close();
        global.broadcastLog('🔵 iDNES: Browser closed');
      }
    }
  }

  buildUrl(queryParams, page = 1) {
    let url = this.buildBaseUrl(queryParams);
    if (page > 1) {
      url += `${url.includes('?') ? '&' : '?'}page=${page}`;
    }
    // global.broadcastLog(`🔵 iDNES: Final URL for page ${page}: ${url}`);
    return url;
  }

  buildBaseUrl(queryParams) {
    // global.broadcastLog('🔵 iDNES: Building base URL with params: ' + JSON.stringify(queryParams));
    
    const baseUrl = 'https://reality.idnes.cz/s/byty';
    const urlParts = [];
    const queryParts = [];

    // Add price range to URL path if both are provided
    if (queryParams.priceFrom && queryParams.priceTo) {
      urlParts.push(`cena-nad-${queryParams.priceFrom}-do-${queryParams.priceTo}`);
    }

    // Add location
    urlParts.push(this.getLocation(queryParams.location));

    // Build the base URL with parts
    let url = `${baseUrl}/${urlParts.join('/')}/?`;

    // Add room types query parameters
    const roomTypes = ['2k', '21', '3k', '31']; // 2+kk, 2+1, 3+kk, 3+1
    roomTypes.forEach((type, index) => {
      queryParts.push(`s-qc[subtypeFlat][${index}]=${encodeURIComponent(type)}`);
    });

    // Add size range if provided
    if (queryParams.sizeFrom) {
      queryParts.push(`s-qc[usableAreaMin]=${encodeURIComponent(queryParams.sizeFrom)}`);
    }
    if (queryParams.sizeTo) {
      queryParts.push(`s-qc[usableAreaMax]=${encodeURIComponent(queryParams.sizeTo)}`);
    }

    // Add additional query parameters
    if (queryParams.priceFrom && !queryParams.priceTo) {
      queryParts.push(`s-qc[priceMin]=${encodeURIComponent(queryParams.priceFrom)}`);
    }
    if (queryParams.priceTo && !queryParams.priceFrom) {
      queryParts.push(`s-qc[priceMax]=${encodeURIComponent(queryParams.priceTo)}`);
    }

    // Combine all query parameters
    url += queryParts.join('&');

    // global.broadcastLog('🔵 iDNES: Built URL: ' + url);
    return url;
  }

  getLocation(location) {
    const locationMap = {
      'praha': 'praha',
      'brno': 'brno',
      'ostrava': 'ostrava'
    };
    return locationMap[location?.toLowerCase()] || 'praha';
  }

  async hasNextPage(page, currentPage) {
    try {
      // Wait for pagination element
      const paginationSelector = '.paginator.paging';
      try {
        await page.waitForSelector(paginationSelector, { timeout: 2000 });
      } catch (err) {
        global.broadcastLog('🔵 iDNES: No pagination found');
        return false;
      }

      // Get all page numbers
      const maxPage = await page.evaluate(() => {
        const pageNumbers = Array.from(document.querySelectorAll('.paginator.paging .paging__item'))
          .map(item => {
            const text = item.textContent.trim();
            const number = parseInt(text);
            return isNaN(number) ? 0 : number;
          });
        return Math.max(...pageNumbers);
      });

      global.broadcastLog(`🔵 iDNES: Current page: ${currentPage}, Max page: ${maxPage}`);
      return currentPage < maxPage;
    } catch (error) {
      global.broadcastLog(`🔴 iDNES Error checking next page: ${error.message}`, 'error');
      return false;
    }
  }

  async extractListings(page) {
    try {
      const listings = await page.evaluate(() => {
        const items = document.querySelectorAll('.c-products__item');
        console.log(`Found ${items.length} items on current page`);
  
        return Array.from(items).map(item => {
          try {
            // Extract price
            const priceElement = item.querySelector('.c-products__price strong');
            const priceText = priceElement?.textContent?.trim();
            const price = priceText ? parseInt(priceText.replace(/\D/g, '')) : null;
  
            // Extract title and parse size
            const titleElement = item.querySelector('.c-products__title');
            const titleText = titleElement?.textContent?.trim() || '';
            const sizeMatch = titleText.match(/(\d+)\s*m²/);
            const size = sizeMatch ? parseInt(sizeMatch[1], 10) : null;
  
            // Extract location
            const locationElement = item.querySelector('.c-products__info');
            
            // Extract image
            const imageElement = item.querySelector('img');
            const imageSrc = imageElement?.src || imageElement?.dataset?.src;
  
            // Extract link and ID
            const linkElement = item.querySelector('.c-products__link');
            const url = linkElement?.href;
            const id = url?.split('/').pop()?.replace(/\/$/, '') || null;
  
            return {
              id: id || `idnes-${Date.now()}-${Math.random()}`,
              url: url || '',
              name: titleText,
              location: locationElement?.textContent?.trim() || '',
              size,
              price,
              pricePerMeter: size && price ? Math.round(price / size) : null,
              images: [imageSrc].filter(Boolean),
              timestamp: new Date().toISOString(),
              source: 'idnes'
            };
          } catch (error) {
            console.error('Error processing listing:', error);
            return null;
          }
        }).filter(Boolean);
      });

      global.broadcastLog(`🔵 iDNES: Successfully extracted ${listings.length} listings`);
      return listings;
    } catch (error) {
      global.broadcastLog(`🔴 iDNES Error extracting listings: ${error.message}`, 'error');
      return [];
    }
  }
}

module.exports = new IDNESService();