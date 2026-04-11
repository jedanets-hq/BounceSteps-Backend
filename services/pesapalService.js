const axios = require('axios');
const crypto = require('crypto');

class PesaPalService {
  constructor() {
    this.consumerKey = process.env.PESAPAL_CONSUMER_KEY;
    this.consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;
    this.baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://pay.pesapal.com/v3' 
      : 'https://cybqa.pesapal.com/pesapalv3';
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * Get authentication token from PesaPal
   */
  async getAuthToken() {
    try {
      // Check if we have a valid token
      if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
        return this.token;
      }

      console.log('🔐 Getting PesaPal auth token...');
      
      const response = await axios.post(
        `${this.baseUrl}/api/Auth/RequestToken`,
        {
          consumer_key: this.consumerKey,
          consumer_secret: this.consumerSecret
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      if (response.data && response.data.token) {
        this.token = response.data.token;
        // Token expires in 5 minutes, refresh after 4 minutes
        this.tokenExpiry = Date.now() + (4 * 60 * 1000);
        console.log('✅ PesaPal token obtained');
        return this.token;
      }

      throw new Error('Failed to get auth token from PesaPal');
    } catch (error) {
      console.error('❌ PesaPal auth error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Register IPN (Instant Payment Notification) URL
   */
  async registerIPN(ipnUrl, notificationType = 'GET') {
    try {
      const token = await this.getAuthToken();
      
      console.log('📡 Registering IPN URL:', ipnUrl);
      
      const response = await axios.post(
        `${this.baseUrl}/api/URLSetup/RegisterIPN`,
        {
          url: ipnUrl,
          ipn_notification_type: notificationType
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      console.log('✅ IPN registered:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ IPN registration error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Submit order request to PesaPal
   */
  async submitOrderRequest(orderData) {
    try {
      const token = await this.getAuthToken();
      
      console.log('📤 Submitting order to PesaPal:', {
        id: orderData.id,
        amount: orderData.amount,
        currency: orderData.currency
      });

      const response = await axios.post(
        `${this.baseUrl}/api/Transactions/SubmitOrderRequest`,
        orderData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        }
      );

      console.log('✅ Order submitted:', {
        order_tracking_id: response.data.order_tracking_id,
        merchant_reference: response.data.merchant_reference,
        redirect_url: response.data.redirect_url
      });

      return response.data;
    } catch (error) {
      console.error('❌ Order submission error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Get transaction status from PesaPal
   */
  async getTransactionStatus(orderTrackingId) {
    try {
      const token = await this.getAuthToken();
      
      console.log('🔍 Checking transaction status:', orderTrackingId);
      
      const response = await axios.get(
        `${this.baseUrl}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          }
        }
      );

      console.log('✅ Transaction status:', response.data);
      return response.data;
    } catch (error) {
      console.error('❌ Transaction status error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create payment request for traveler
   */
  async createPaymentRequest({
    bookingId,
    amount,
    currency = 'TZS',
    description,
    callbackUrl,
    cancellationUrl,
    notificationId,
    billingAddress
  }) {
    try {
      const merchantReference = `BOOKING-${bookingId}-${Date.now()}`;
      
      const orderData = {
        id: merchantReference,
        currency: currency,
        amount: parseFloat(amount),
        description: description || `Payment for booking ${bookingId}`,
        callback_url: callbackUrl,
        cancellation_url: cancellationUrl || callbackUrl,
        notification_id: notificationId,
        billing_address: billingAddress || {
          email_address: '',
          phone_number: '',
          country_code: 'TZ',
          first_name: '',
          middle_name: '',
          last_name: '',
          line_1: '',
          line_2: '',
          city: '',
          state: '',
          postal_code: '',
          zip_code: ''
        }
      };

      const result = await this.submitOrderRequest(orderData);
      
      return {
        success: true,
        merchantReference: merchantReference,
        orderTrackingId: result.order_tracking_id,
        redirectUrl: result.redirect_url,
        error: result.error,
        status: result.status
      };
    } catch (error) {
      console.error('❌ Create payment request error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Verify payment status
   */
  async verifyPayment(orderTrackingId) {
    try {
      const status = await this.getTransactionStatus(orderTrackingId);
      
      return {
        success: true,
        paymentStatus: status.payment_status_description,
        amount: status.amount,
        currency: status.currency,
        merchantReference: status.merchant_reference,
        paymentMethod: status.payment_method,
        confirmed: status.confirmation_code ? true : false,
        confirmationCode: status.confirmation_code,
        message: status.message
      };
    } catch (error) {
      console.error('❌ Verify payment error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new PesaPalService();
