# Mystery Shopping Blood Chart

One simple page. No installation.

1. Download `index.html` and double-click it (it opens in Chrome, Edge or Safari).
2. Type a dealership name and press **Add dealership**.
3. Tap **YES** or **NO** for each question.
4. Scores calculate by themselves: per dealership, per section, per question and overall.

**How the percentage works:** Yes answers ÷ questions answered. Questions left blank are not counted.

* Your work saves automatically in the browser on that computer.
* **Download results** saves a file that opens in Excel.
* **Edit questions** lets you change the question list for another OEM (one question per line, start a line with `#` for a section heading).
* Adding the same dealership twice creates "(visit 2)".

## Google Form for delegates

1. Go to https://script.google.com, click **New project**, paste in `google-form-setup.gs`, click **Save**, then **Run**.
2. Allow the permissions Google asks for. The **Execution log** shows the form link for delegates and the Google Sheet where answers arrive.
3. To load answers into the app: in Google Forms open **Responses**, click the **⋮** menu and choose **Download responses (.csv)**. In the app click **Import from Google Form**, browse for that file (the .zip is fine) and click **Import answers**. Import again any time; answers already loaded are skipped.

The earlier, larger version of the app is still in this branch's git history (commit `Build Mystery Shopping assessment...`).
