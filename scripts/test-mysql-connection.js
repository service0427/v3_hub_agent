const mysql = require('mysql2/promise');

async function testConnection() {
  console.log('Testing MySQL connection...');
  console.log('Host: 138.2.125.63');
  console.log('User: magic_dev');
  console.log('Database: magic_db');
  
  try {
    const connection = await mysql.createConnection({
      host: '138.2.125.63',
      user: 'magic_dev',
      password: '!magic00',
      database: 'magic_db',
      connectTimeout: 10000
    });
    
    console.log('\n✅ Connection successful!');
    
    // Test query
    const [rows] = await connection.execute('SELECT 1 as test');
    console.log('Test query result:', rows);
    
    // Show tables
    const [tables] = await connection.execute('SHOW TABLES');
    console.log('\nTables in magic_db:');
    tables.forEach(table => {
      console.log(`- ${Object.values(table)[0]}`);
    });
    
    // Check ad_keywords structure
    console.log('\n--- ad_keywords table structure ---');
    const [columns] = await connection.execute('DESCRIBE ad_keywords');
    columns.forEach(col => {
      console.log(`${col.Field} | ${col.Type} | ${col.Null} | ${col.Key}`);
    });
    
    // Sample data
    console.log('\n--- Sample data from ad_keywords ---');
    const [sampleData] = await connection.execute('SELECT * FROM ad_keywords LIMIT 5');
    console.log('Total sample rows:', sampleData.length);
    if (sampleData.length > 0) {
      console.log('Columns:', Object.keys(sampleData[0]));
      sampleData.forEach((row, idx) => {
        console.log(`Row ${idx + 1}:`, row);
      });
    }
    
    // Check total count
    const [countResult] = await connection.execute('SELECT COUNT(*) as total FROM ad_keywords');
    console.log('\nTotal keywords in ad_keywords:', countResult[0].total);
    
    // Check ad_slots
    console.log('\n--- ad_slots table structure ---');
    const [slotColumns] = await connection.execute('DESCRIBE ad_slots');
    slotColumns.forEach(col => {
      console.log(`${col.Field} | ${col.Type} | ${col.Null} | ${col.Key}`);
    });
    
    // Sample ad_slots data
    console.log('\n--- Sample data from ad_slots ---');
    const [slotData] = await connection.execute('SELECT * FROM ad_slots LIMIT 5');
    console.log('Total sample rows:', slotData.length);
    if (slotData.length > 0) {
      slotData.forEach((row, idx) => {
        console.log(`Row ${idx + 1}:`, row);
      });
    }
    
    await connection.end();
    console.log('\n✅ Connection closed successfully');
    
  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
    console.error('Error code:', error.code);
    console.error('Error errno:', error.errno);
  }
}

testConnection();