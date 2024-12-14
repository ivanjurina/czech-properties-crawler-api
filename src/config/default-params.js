const locationMap = {
  praha: 10,
  brno: 2,
  ostrava: 8
};

const defaultParams = {
  category_main_cb: 1,      // 1 = Flat/Apartment
  category_type_cb: 1,      // 1 = Sale
  per_page: 100,
  locality_region_id: 10,   // Default to Prague
  size_from: '60',
  size_to: '10000000000',
  room_from: '2',
  room_to: '4',
  price_from: '0',
  price_to: '30000000',
  sort: '0'                 // Default sort by date
};

module.exports = {
  locationMap,
  defaultParams
};
