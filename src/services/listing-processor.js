const removeAccents = (str) => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
};

const cleanLocation = (location) => {
  return removeAccents(location || '')
    .replace(/\s+/g, ' ')
    .trim();
};

class ListingProcessor {
  constructor() {
    this.groupColors = [
      'bg-yellow-100',
      'bg-blue-100',
      'bg-green-100',
      'bg-purple-100',
      'bg-pink-100',
      'bg-orange-100',
      'bg-teal-100',
      'bg-red-100'
    ];
  }

  processListings(listings) {
    if (!listings?.length) return [];

    // Create groups based on size, price, and location
    const groups = new Map();
    let colorIndex = 0;

    listings.forEach(listing => {
      if (!listing) return;

      const key = this.createGroupKey(listing);
      
      if (!groups.has(key)) {
        groups.set(key, {
          items: [],
          color: null
        });
      }

      groups.get(key).items.push(listing);
    });

    // Process groups and assign colors to duplicates
    const processedGroups = Array.from(groups.values()).map(group => {
      if (group.items.length > 1) {
        group.color = this.groupColors[colorIndex % this.groupColors.length];
        colorIndex++;
      }
      return group;
    });

    // Sort groups so that groups with duplicates come first
    processedGroups.sort((a, b) => {
      if (a.color && !b.color) return -1;
      if (!a.color && b.color) return 1;
      return 0;
    });

    // Flatten groups back into a single array, keeping duplicates together
    const processedListings = processedGroups.flatMap(group => 
      group.items.map(listing => ({
        ...listing,
        backgroundColor: group.color,
        duplicateCount: group.items.length > 1 ? group.items.length : null
      }))
    );

    this.logDuplicateStats(processedGroups);

    return processedListings;
  }

  createGroupKey(listing) {
    const roundedPrice = Math.round(listing.price / 10000) * 10000;
    const roundedSize = Math.round(listing.size);
    const cleanedLocation = cleanLocation(listing.location);

    return `${roundedPrice}-${roundedSize}-${cleanedLocation}`;
  }

  logDuplicateStats(groups) {
    const duplicateGroups = groups.filter(g => g.items.length > 1);
    const duplicateCount = duplicateGroups.reduce((sum, group) => sum + group.items.length, 0);
    const uniqueCount = groups.filter(g => g.items.length === 1).length;

    global.broadcastLog('🔄 Duplicate Analysis:', [
      `Total unique listings: ${uniqueCount}`,
      `Total duplicate listings: ${duplicateCount}`,
      `Number of duplicate groups: ${duplicateGroups.length}`,
      ...duplicateGroups.map(group => 
        `Group of ${group.items.length} listings: ${group.items.map(item => item.source).join(', ')}`
      )
    ].join('\n'));
  }
}

module.exports = new ListingProcessor();
