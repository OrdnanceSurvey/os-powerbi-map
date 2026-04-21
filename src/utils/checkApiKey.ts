/**
 * Checks the status of an API key for the OS Maps API. 
 * It determines whether the key is free, premium, or invalid by making requests to specific endpoints.
 * This function first checks if the key is valid by attempting to access a free map tile. 
 * If that succeeds, it then checks if the key is premium by trying to access a premium map tile. 
 * If the first (free tile) request fails, it marks the key as invalid.
 * 
 * @param apikey Checks if the provided API key is invalid, free, or premium.
 * @returns  A promise that resolves to the status of the API key: "free", "premium", or "invalid".
 */
export async function checkAPIKey(apikey: string) {
  let keyStatus: "free" | "premium" | "invalid";
  // Check if API key is valid or free
  if (!apikey || apikey.trim() === "") {
    return "invalid";
  }
  try {
    const freeMapsUrl =
      "https://api.os.uk/maps/raster/v1/zxy/Light_3857/14/8056/5227.png?key=";
    const response = await fetch(`${freeMapsUrl}${apikey}`);
    if (response.ok) {
      keyStatus = "free";
    }
  } catch (error) {
    keyStatus = "invalid";
  }

  // If key is valid check if premium
  if (keyStatus == "free") {
    try {
      const premiumMapsUrl =
        "https://api.os.uk/maps/raster/v1/zxy/Light_3857/20/515642/334561.png?key=";
      const response = await fetch(`${premiumMapsUrl}${apikey}`);
      if (response.ok) {
        keyStatus = "premium";
      }
    } catch (error) {
      //   Do anything?
    }
  }
  return keyStatus;
}
