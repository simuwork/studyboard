/**
 * Studyboard API Service
 * Bridges the side panel scripts and Chrome messaging APIs
 */

class ApiService {
  static sendMessage(message) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          resolve(response);
        });
      } catch (error) {
        console.error('Runtime messaging failed:', error);
        resolve(undefined);
      }
    });
  }

  static async getCourses() {
    const response = await this.sendMessage({ action: 'getCourses' });

    if (!response) {
      throw new Error('No response from Canvas. Open a Canvas tab and try again.');
    }

    if (!response.success) {
      throw new Error(response.error || 'Unknown error loading courses.');
    }

    return response.data;
  }

  static async getCourseFiles(courseId) {
    const response = await this.sendMessage({ action: 'getCourseFiles', courseId });

    if (!response || !response.success) {
      const message = (response && response.error) || 'Unable to load files for this course.';
      throw new Error(message);
    }

    return response.data;
  }
}
