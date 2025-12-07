const CryptoJS = require('crypto-js');

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
    console.log('📦 Shopify Webhook Received');
    
    // Log the event for debugging
    console.log('Event type:', shopifyEvent.event || 'unknown');
    console.log('Total price:', shopifyEvent.total_price);
    console.log('Currency:', shopifyEvent.currency);
    
    let eventType = '';
    let value = 0;
    let currency = 'USD';
    
    // Determine event type
    if (shopifyEvent.event?.includes('order')) {
      eventType = 'Purchase';
    } else if (shopifyEvent.event?.includes('checkout')) {
      eventType = 'InitiateCheckout';
    } else if (shopifyEvent.event?.includes('cart')) {
      eventType = 'AddToCart';
    }
    
    // Get value and currency
    if (shopifyEvent.total_price) {
      value = shopifyEvent.total_price / 100; // Convert cents to dollars
      currency = shopifyEvent.currency || 'USD';
    }
    
    // Only send to TikTok if we have valid data
    if (eventType && value > 0) {
      console.log(`🚀 Sending to TikTok: ${eventType}, Value: ${value}, Currency: ${currency}`);
      
      // Prepare TikTok payload
      const eventId = `shopify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date().toISOString().split('.')[0] + 'Z';
      
      const tiktokPayload = {
        pixel_code: process.env.TIKTOK_PIXEL_ID,
        event: eventType,
        event_id: eventId,
        timestamp: timestamp,
        properties: {
          value: value,
          currency: currency
        },
        context: {
          ip: shopifyEvent.client_details?.browser_ip,
          user_agent: shopifyEvent.client_details?.user_agent
        }
      };
      
      // Add contents if available
      if (shopifyEvent.line_items && shopifyEvent.line_items.length > 0) {
        tiktokPayload.properties.contents = shopifyEvent.line_items.map(item => ({
          content_id: item.product_id?.toString(),
          quantity: item.quantity,
          price: (item.price / 100).toFixed(2)
        }));
      }
      
      // Add hashed email if available
      if (shopifyEvent.customer?.email) {
        const hash = CryptoJS.SHA256(shopifyEvent.customer.email.toLowerCase().trim()).toString(CryptoJS.enc.Hex);
        tiktokPayload.context.user = { email: hash };
      }
      
      // Send to TikTok API
      try {
        const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/pixel/track/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Access-Token': process.env.TIKTOK_ACCESS_TOKEN
          },
          body: JSON.stringify(tiktokPayload)
        });
        
        const result = await response.json();
        console.log('✅ TikTok API Response:', result);
      } catch (apiError) {
        console.error('❌ TikTok API Error:', apiError.message);
      }
    }
    
    // Always respond to Shopify
    res.status(200).json({ 
      success: true, 
      message: 'Webhook processed',
      event: eventType || 'none',
      value: value
    });
    
  } catch (error) {
    console.error('💥 Webhook Error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};