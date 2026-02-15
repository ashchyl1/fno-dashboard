import os
import requests
import zipfile
import io
from datetime import datetime, timedelta

# Constants
NSE_BASE_URL = "https://www.nseindia.com"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US,en;q=0.9"
}

DATA_DIR = "data"

def create_session():
    s = requests.Session()
    s.headers.update(HEADERS)
    # Visit homepage to get cookies
    s.get(NSE_BASE_URL)
    return s

def download_bhavcopy(session):
    # Try current date, then previous operational days
    date = datetime.now()
    if date.hour < 18: # If before 6 PM, probably no data for today yet
        date = date - timedelta(days=1)

    for _ in range(3): # Try last 3 days
        date_str = date.strftime("%d%b%Y").upper() # e.g., 28JAN2025
        year = date.strftime("%Y")
        month = date.strftime("%b").upper()
        
        # URL for Derivatives Bhavcopy (fo{date}bhav.csv.zip)
        url = f"https://archives.nseindia.com/content/fo/fo{date_str}bhav.csv.zip"
        print(f"Trying: {url}")
        
        try:
            response = session.get(url, stream=True)
            if response.status_code == 200:
                print("Download successful!")
                z = zipfile.ZipFile(io.BytesIO(response.content))
                z.extractall(DATA_DIR)
                print(f"Extracted to {DATA_DIR}")
                return True
        except Exception as e:
            print(f"Error: {e}")
        
        date = date - timedelta(days=1)
    
    print("Could not find recent Bhavcopy.")
    return False

if __name__ == "__main__":
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
    
    sess = create_session()
    download_bhavcopy(sess)
    # Note: Option Chain scraping is complex due to NSE dynamic loading. 
    # Providing direct download for Bhavcopy is the most stable automated step.
