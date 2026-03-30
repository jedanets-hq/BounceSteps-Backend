const http = require('http');
http.get('http://localhost:5000/api/services?featured=true&limit=6', (resp) => {
  let data = '';
  resp.on('data', (c) => { data += c; });
  resp.on('end', () => {
    const json = JSON.parse(data);
    console.log("Returned services count:", json.services.length);
    if(json.services.length > 0) {
      console.log("Keys of first service:", Object.keys(json.services[0]).join(", "));
      console.log("Title of first service:", json.services[0].title);
      console.log("Images of first service:", json.services[0].images);
    }
  });
});
