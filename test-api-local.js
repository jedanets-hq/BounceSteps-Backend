const http = require('http');

http.get('http://localhost:5000/api/services?featured=true&limit=6', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log('Result Count:', parsed.services?.length);
      if (parsed.services && parsed.services.length > 0) {
        console.log('First Service Keys:', Object.keys(parsed.services[0]));
        console.log('First Service Title:', parsed.services[0].title);
        console.log('First Service Obj:', JSON.stringify(parsed.services[0], null, 2));
      } else {
        console.log('Response:', data);
      }
    } catch (e) {
      console.error('JSON Error:', e);
    }
  });
}).on('error', (e) => {
  console.error(`Got error: ${e.message}`);
});
