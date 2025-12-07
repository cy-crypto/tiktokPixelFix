const crypto = require('crypto-js');

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const shopifyEvent = req.body;
    console.log('Shopify Webhook Received:', shopifyEvent.event || 'unknown');
    
    let tiktokEvent = null;
    let value = 0;
    let currency = 'USD';
    let eventType = '';

    // Helper function to hash for TikTok
    const hashData = (data) => {
      if (!data) return undefined;
      return crypto.SHA256(data.toString().toLowerCase().trim()).toString(crypto.enc.Hex);
    };

    // Process based on Shopify event
    if (shopifyEvent.total_price) {
      value = shopifyEvent.total_price / 100; // Shopify stores in cents
      currency = shopifyEvent.currency || 'USD';
      
      if (shopifyEvent.event?.includes('order')) {
        eventType = 'Purchase';
      } else if (shopifyEvent.event?.includes('checkout')) {
        eventType = 'InitiateCheckout';
      } else if (shopifyEvent.event?.includes('cart')) {
        eventType = 'AddToCart';
      }
    }

    // Only process if we have an event type and value
    if (eventType && value > 0) {
      console.log(`Sending to TikTok: ${eventType}, Value: ${value}, Currency: ${currency}`);
      
      // Prepare TikTok event
      const eventId = `shopify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date().toISOString().split('.')[0] + 'Z';
      
      const tiktokPayload = {
        pixel_code: process.env.TIKTOK_PIXEL_ID,
        event: eventType,
        event_id: eventId,
        timestamp: timestamp,
        properties: {
          value: value,
          currency: currency,
          contents: shopifyEvent.line_items?.map(item => ({
            content_id: item.product_id?.toString(),
            quantity: item.quantity,
            price: (item.price / 100).toFixed(2)
          })) || []
        },
        context: {
          ip: shopifyEvent.client_details?.browser_ip,
          user_agent: shopifyEvent.client_details?.user_agent,
          user: {}
        }
      };

      // Add hashed customer data if available
      if (shopifyEvent.customer?.email) {
        tiktokPayload.context.user.email = hashData(shopifyEvent.customer.email);
      }
      if (shopifyEvent.customer?.phone) {
        tiktokPayload.context.user.phone = hashData(shopifyEvent.customer.phone);
      }

      // Send to TikTok API
      try {
        const tiktokResponse = await fetch('https://business-api.tiktok.com/open_api/v1.3/pixel/track/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Access-Token': process.env.TIKTOK_ACCESS_TOKEN
          },
          body: JSON.stringify(tiktokPayload)
        });

        const result = await tiktokResponse.json();
        console.log('TikTok API Response:', JSON.stringify(result, null, 2));
        
        if (result.code !== 0) {
          console.error('TikTok API Error:', result.message);
        }
      } catch (apiError) {
        console.error('Failed to send to TikTok API:', apiError.message);
      }
    }

    res.status(200).json({ 
      success: true, 
      event: eventType || 'no_event_processed',
      value: value 
    });
    
  } catch (error) {
    console.error('Webhook Processing Error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'production' ? undefined : error.stack
    });
  }
};