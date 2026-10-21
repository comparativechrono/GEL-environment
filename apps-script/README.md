# Submissions to Google (Apps Script)

By default the simulator keeps research proposals and Airlock requests in each
student's browser and reviews them with a timer. To also receive a copy of every
submission (for marking, or to review them by hand later), deploy `Code.gs` as a
Google Apps Script web app:

1. Create a Google Sheet (for example "RE simulator submissions").
2. In the sheet: **Extensions ▸ Apps Script**. Replace the code with `Code.gs`.
   Optionally set `FOLDER_ID` to a Drive folder for the Airlock files.
3. **Deploy ▸ New deployment ▸ Web app**: *Execute as* **Me**, *Who has access* **Anyone**.
   Authorise it, and copy the web app URL (`https://script.google.com/macros/s/…/exec`).
4. In `js/config.js` set:

   ```js
   submissions: {
     mode: 'appsScript',
     appsScriptUrl: 'https://script.google.com/macros/s/…/exec',
     …
   }
   ```

Each proposal and each Airlock request then adds a row to the **Submissions**
sheet; the files of Airlock requests (up to 10 MB each) are saved in Drive. The
simulated review in the browser still runs as before (Settings ▸ Training controls
can switch it off, so that an instructor decides each request).

Not done yet: sending decisions made in the sheet back to the students' desktops.
