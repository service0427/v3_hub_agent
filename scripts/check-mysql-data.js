const mysql = require('mysql2/promise');

async function checkData() {
  const connection = await mysql.createConnection({
    host: '138.2.125.63',
    user: 'magic_dev',
    password: '!magic00',
    database: 'magic_db',
    connectTimeout: 10000
  });
  
  try {
    // Check sample data
    console.log('=== Sample data from ad_slots (ACTIVE) ===');
    const [sampleData] = await connection.execute(`
      SELECT 
        ad_slot_id,
        work_keyword,
        vendor_item_id,
        product_url
      FROM ad_slots
      WHERE status = 'ACTIVE' 
        AND is_active = 1
      LIMIT 10
    `);
    
    sampleData.forEach((row, idx) => {
      console.log(`\nRow ${idx + 1}:`);
      console.log(`  work_keyword: ${row.work_keyword}`);
      console.log(`  vendor_item_id: ${row.vendor_item_id}`);
      console.log(`  product_url: ${row.product_url}`);
    });
    
    // Group by analysis
    console.log('\n\n=== GROUP BY work_keyword, vendor_item_id ===');
    const [groupedData] = await connection.execute(`
      SELECT 
        work_keyword,
        vendor_item_id,
        COUNT(*) as count,
        MIN(product_url) as sample_url
      FROM ad_slots
      WHERE status = 'ACTIVE' 
        AND is_active = 1
        AND work_keyword IS NOT NULL
        AND vendor_item_id IS NOT NULL
      GROUP BY work_keyword, vendor_item_id
      ORDER BY count DESC
      LIMIT 10
    `);
    
    console.log('\nTop 10 keyword+vendor_item_id combinations:');
    groupedData.forEach((row, idx) => {
      console.log(`\n${idx + 1}. ${row.work_keyword} + ${row.vendor_item_id}`);
      console.log(`   Count: ${row.count}`);
      console.log(`   Sample URL: ${row.sample_url}`);
    });
    
    // Check for vendor_item_id extraction from URL
    console.log('\n\n=== Check vendor_item_id in URL ===');
    const [urlCheck] = await connection.execute(`
      SELECT 
        product_url,
        vendor_item_id,
        CASE 
          WHEN product_url LIKE CONCAT('%vendorItemId=', vendor_item_id, '%') THEN 'MATCH'
          ELSE 'NO MATCH'
        END as url_match
      FROM ad_slots
      WHERE status = 'ACTIVE' 
        AND is_active = 1
        AND vendor_item_id IS NOT NULL
        AND product_url IS NOT NULL
      LIMIT 10
    `);
    
    urlCheck.forEach((row, idx) => {
      console.log(`\n${idx + 1}. vendor_item_id: ${row.vendor_item_id}`);
      console.log(`   URL Match: ${row.url_match}`);
      console.log(`   URL: ${row.product_url}`);
    });
    
  } finally {
    await connection.end();
  }
}

checkData().catch(console.error);