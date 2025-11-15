export const logEvent = (eventName: string, params: Record<string, any> = {}) => {
  // In a real application, this would integrate with an analytics service
  // like Google Analytics, Mixpanel, etc.
  console.log(`[Analytics Event] Name: "${eventName}"`, {
    timestamp: new Date().toISOString(),
    parameters: params,
  });
};
