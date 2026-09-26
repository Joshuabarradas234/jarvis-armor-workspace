/**
 * Contract for future authenticated calendar providers. Local storage remains
 * usable with no connection. Implement these methods in your OAuth adapter;
 * the application never presents a disconnected provider as live data.
 */
export class CalendarProvider {
  async connectionStatus(){return {connected:false,reason:'CALENDAR PROVIDER NOT CONFIGURED'};}
  async listEvents(_range){throw Error('Calendar provider is not connected.');}
  async createEvent(_event){throw Error('Calendar provider is not connected.');}
  async updateEvent(_event){throw Error('Calendar provider is not connected.');}
  async deleteEvent(_id){throw Error('Calendar provider is not connected.');}
  async disconnect(){}
}
