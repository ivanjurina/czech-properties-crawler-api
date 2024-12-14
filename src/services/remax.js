const puppeteer = require('puppeteer');

class RemaxService {
  async fetchListings(queryParams) {
    let browser = null;
    try {
      // global.broadcastLog('🟡 Remax: Starting fetch process with params: ' + JSON.stringify(queryParams));
      let allListings = [];

      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      let currentPage = 1;
      let hasNextPage = true;
      const MAX_PAGES = 10;

      while (hasNextPage && currentPage <= MAX_PAGES) {
        const url = this.buildUrl(queryParams, currentPage);
        // global.broadcastLog(`🟡 Remax: Fetching page ${currentPage}, URL: ${url}`);

        await page.goto(url, { waitUntil: 'networkidle0' });

        try {
          await page.waitForSelector('.pl-items__item', { timeout: 5000 });
        } catch (err) {
          global.broadcastLog('🟡 Remax: No listings found on page');
          break;
        }

        // Add a small delay to ensure dynamic content is loaded
        await new Promise(resolve => setTimeout(resolve, 2000));

        const pageListings = await this.extractListings(page);
        global.broadcastLog(`🟡 Remax: Found ${pageListings.length} listings on page ${currentPage}`);
        allListings = [...allListings, ...pageListings];

        hasNextPage = await this.hasNextPage(page, currentPage);
        if (hasNextPage && currentPage < MAX_PAGES) {
          global.broadcastLog(`🟡 Remax: Moving to page ${currentPage + 1}`);
          currentPage++;
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          global.broadcastLog(`🟡 Remax: Stopping pagination. Reason: ${currentPage >= MAX_PAGES ? 'Max pages reached' : 'No more pages'}`);
          hasNextPage = false;
        }
      }

      global.broadcastLog(`🟡 Remax: Completed fetch, total listings: ${allListings.length}`);
      return allListings;

    } catch (error) {
      global.broadcastLog(`🔴 Remax Error: ${error.message}`, 'error');
      return [];
    } finally {
      if (browser) {
        await browser.close();
        global.broadcastLog('🟡 Remax: Browser closed');
      }
    }
  }

  buildUrl(queryParams, page = 1) {
    const baseUrl = 'https://www.remax-czech.cz/reality/vyhledavani/';
    
    const params = new URLSearchParams({
      'area_from': queryParams.sizeFrom || '50',
      'area_to': queryParams.sizeTo || '100',
      'hledani': '2', // prodej
      'price_from': queryParams.priceFrom || '8000000',
      'price_to': queryParams.priceTo || '10000000',
      'regions[19]': 'on', // Praha
      'types[4][3]': 'on',  // 2+kk
      'types[4][4]': 'on',  // 2+1
      'types[4][5]': 'on',  // 3+kk
      'types[4][10]': 'on', // 3+1
      'types[4][11]': 'on'  // 4+kk
    });

    if (page > 1) {
      params.append('stranka', page.toString());
    }

    const url = `${baseUrl}?${params.toString()}`;
    global.broadcastLog(`🟡 Remax: Built URL for page ${page}: ${url}`);
    return url;
  }

  async hasNextPage(page, currentPage) {
    try {
      const paginationSelector = '.pagination';
      try {
        await page.waitForSelector(paginationSelector, { timeout: 2000 });
      } catch (err) {
        global.broadcastLog('🟡 Remax: No pagination found');
        return false;
      }

      // Get max page number
      const maxPage = await page.evaluate(() => {
        const pageNumbers = Array.from(document.querySelectorAll('.pagination .page-link'))
          .map(link => {
            const number = parseInt(link.textContent);
            return isNaN(number) ? 0 : number;
          });
        return Math.max(...pageNumbers);
      });

      global.broadcastLog(`🟡 Remax: Current page: ${currentPage}, Max page: ${maxPage}`);
      return currentPage < maxPage;
    } catch (error) {
      global.broadcastLog(`🔴 Remax Error checking next page: ${error.message}`, 'error');
      return false;
    }
  }

  async extractListings(page) {
    try {
      const listings = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.pl-items__item')).map(item => {
          try {
            // Extract price
            const priceElement = item.querySelector('.pl-items__item-price strong');
            const priceText = priceElement?.textContent?.trim();
            const price = priceText ? parseInt(priceText.replace(/\D/g, '')) : null;

            // Extract title and parse size
            const titleElement = item.querySelector('h2.h5 strong');
            const titleText = titleElement?.textContent?.trim() || '';
            const sizeMatch = titleText.match(/(\d+)\s*m²/);
            const size = sizeMatch ? parseInt(sizeMatch[1], 10) : null;

            // Extract location
            const locationElement = item.querySelector('.pl-items__item-info p');

            // Extract images
            const images = Array.from(item.querySelectorAll('.pl-items__images-media img'))
              .map(img => img.src || img.dataset.src)
              .filter(Boolean);

            // Extract link
            const linkElement = item.querySelector('a.pl-items__link');
            const url = linkElement?.href;
            const id = url?.split('/').pop()?.replace(/\/$/, '') || null;

            return {
              id: id || `remax-${Date.now()}-${Math.random()}`,
              url: url || '',
              name: titleText,
              location: locationElement?.textContent?.trim()
                ?.replace(/\s+/g, ' ')
                ?.replace('ulice', '')
                ?.trim() || '',
              size,
              price,
              pricePerMeter: size && price ? Math.round(price / size) : null,
              images,
              timestamp: new Date().toISOString(),
              source: 'remax'
            };
          } catch (error) {
            console.error('Error processing Remax listing:', error);
            return null;
          }
        }).filter(Boolean);
      });

      return listings;
    } catch (error) {
      global.broadcastLog(`🔴 Remax Error extracting listings: ${error.message}`, 'error');
      return [];
    }
  }
}

module.exports = new RemaxService();
