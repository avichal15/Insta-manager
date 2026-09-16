import { MessageType, Message } from './types';

export class Messaging {
  static async sendMessage<T>(type: MessageType, data?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const message: Message = { type, data };
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  static async sendToTab<T>(tabId: number, type: MessageType, data?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      const message: Message = { type, data };
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  static onMessage(type: MessageType, handler: (data: any, sender: chrome.runtime.MessageSender) => Promise<any>): void {
    chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
      if (message.type === type) {
        handler(message.data, sender)
          .then((response) => sendResponse({ success: true, data: response }))
          .catch((error) => sendResponse({ success: false, error: error.message }));
        return true; // Keep the messaging channel open for asynchronous response
      }
      return false;
    });
  }

  static async sendToActiveInstagramTab<T>(type: MessageType, data?: any): Promise<T> {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true, url: '*://*.instagram.com/*' }, async (tabs) => {
        if (tabs.length === 0 || !tabs[0].id) {
          reject(new Error('No active Instagram tab found'));
          return;
        }
        try {
          const response = await this.sendToTab<T>(tabs[0].id, type, data);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}
