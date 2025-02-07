const { google } = require("googleapis");
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');
const creds = JSON.parse(fs.readFileSync('./google-credentials.json', 'utf8')); // Your service account JSON credentials
const twilio = require('twilio');
const express = require('express');
const bodyParser = require('body-parser');
const { JWT } = require('google-auth-library');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const accountSid = 'AC5a7127a610aad229e16997ccc123c763';
const authToken = 'b757d49b360c1fe363b783d2da8e3d63';
const whatsappNumber = 'whatsapp:+14155238886';
const client = twilio(accountSid, authToken);

// Google Spreadsheet setup
const doc = new GoogleSpreadsheet('1wAiD2D_UmKc68LgkVdTMn1Qh7TcqVbYSU37LWImL9ME'); // Replace with your spreadsheet ID

// Authenticate with the Google Sheets API using service account credentials
async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "./google-credentials.json", // Replace with the path to your JSON key file
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const authClient = await auth.getClient();
  return google.sheets({ version: "v4", auth: authClient });
}

// Retrieve all data from Sheet1
async function accessSheetData() {
  try {
    const sheets = await getSheetsClient();
    const range = "Sheet1"; // Adjust range as needed
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    
    const rows = response.data.values;
    
    // Check if the sheet is empty or header is missing
    if (rows.length === 0 || !rows[0].includes('Name') || !rows[0].includes('Age')) {
      // Initialize the header row if it's missing
      const header = ['Name', 'Age', 'Mobile Number', 'MR No', 'Status'];
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "Sheet1!A1:E1", // Update header row
        valueInputOption: 'USER_ENTERED',
        resource: { values: [header] },
      });
      console.log('Header row added');
    }

    console.log("Sheet Data:", rows);
    return rows;
  } catch (error) {
    console.error("Error fetching data from Google Sheets:", error);
    return null;
  }
}

      

// Handle incoming WhatsApp messages
app.post('/whatsapp', async (req, res) => {
  console.log("Incoming Message:", req.body);
  const message = req.body.Body.trim().toLowerCase();
  const from = req.body.From.replace('whatsapp:+', '');
  if (message === 'hi') {
   sendMessage(from, "Welcome to the hospital! Type 'book' to schedule an appointment or 'status, MR No' to check your appointment status.");
  //  sendListMessage(from);
  } else if (message === 'book') {
    sendMessage(from, "Send your details as:\nName, Age, Mobile Number, MR No (if available)");
  } else if (message.startsWith('status')) {
    // Expected format: "status, MR12345"
    const parts = req.body.Body.split(',');
    if (parts.length < 2) {
      sendMessage(from, "Invalid format. Please send as: status, MR No");
    } else {
      const mr_no = parts[1].trim();
      const patientData = await getPatientDataByMRNo(mr_no);
      if (patientData) {
        // Construct a response message using the retrieved data
        // Assuming patientData structure: [name, age, mobile, mr_no, status]
        const responseText = `Patient Details:
Name: ${patientData[0]}
Age: ${patientData[1]}
Mobile: ${patientData[2]}
MR No: ${patientData[3]}
Status: ${patientData[4]}`;
        sendMessage(from, responseText);
      } else {
        sendMessage(from, "No records found for the provided MR No.");
      }
    }
  } else if (message.includes(',')) {
    // Handle booking: expected format "Name, Age, Mobile, MR No"
    const [name, age, mobile, mr_no] = req.body.Body.split(',').map(item => item.trim());
    await storePatientData(name, age, mobile, mr_no || null);
    sendMessage(from, "Thank you for booking. Your details have been recorded.");
  } else {
    sendMessage(from, "Invalid input. Type 'hi' to start.");
  }

  res.sendStatus(200);
});

// Send WhatsApp Message
function sendMessage(to, text) {
  client.messages.create({
    from: whatsappNumber,
    body: text,
    // body: " ", 
    // interactive: interactiveMessage,
    to: `whatsapp:${+919944281715}` // Use dynamic number from the incoming message
  }).then(msg => console.log("Message Sent:", msg.sid))
    .catch(err => console.error("Twilio Error:", err));
}
function sendListMessage(to) {
  const listMessage = {
    type: 'list', // Indicates a list message
    header: {
      type: 'text',
      text: 'Appointment Options'
    },
    body: {
      text: 'Please choose an option:'
    },
    footer: {
      text: 'Powered by Our Hospital'
    },
    action: {
      button: 'View Options', // This is the text on the list message button
      sections: [
        {
          title: 'Services',
          rows: [
            {
              id: 'book_appointment',
              title: 'Book Appointment',
              description: 'Schedule a new appointment'
            },
            {
              id: 'check_status',
              title: 'Check Status',
              description: 'View your appointment status'
            }
          ]
        }
      ]
    }
  };

  sendMessage(to, listMessage);
}
// Get patient data filtered by MR No.
async function getPatientDataByMRNo(mr_no) {
  const rows = await accessSheetData();
  if (!rows) return null;

  // If your sheet includes a header row, you may want to skip it:
  // const dataRows = rows.slice(1);
  const dataRows = rows; // Assuming no header row

  // Assuming MR No is the fourth column (index 3)
  const foundRow = dataRows.find(row => row[3] && row[3].toLowerCase() === mr_no.toLowerCase());
  return foundRow;
}
// Store Patient Data in Google Sheets
// Store Patient Data in Google Sheets
async function storePatientData(name, age, mobile, mr_no) {
  try {
    // Ensure MR No format as MR12345
    if (mr_no && !mr_no.startsWith('MR')) {
      mr_no = `MR${mr_no}`;
    }

    // Get the authenticated sheets client
    const sheets = await getSheetsClient();
    
    const spreadsheetId = "1wAiD2D_UmKc68LgkVdTMn1Qh7TcqVbYSU37LWImL9ME"; // Your spreadsheet ID
    const range = "Sheet1"; // The sheet name (or a specific range, if desired)
    
    // Prepare the row data
    const values = [
      [name, age, mobile, mr_no || 'Not Provided', 'Pending'] // Appending a new row with patient details and a default status
    ];
    const resource = {
      values: values,
    };
    
    // Append the row data to the sheet
    const result = await sheets.spreadsheets.values.append({
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED', // Use 'USER_ENTERED' to parse the data as if the user typed it in
      resource: resource,
    });
    
    console.log(`Row appended. Updated cells: ${result.data.updates.updatedCells}`);
    return true;
  } catch (error) {
    console.error("Error storing data in Google Sheets:", error);
    return false;
  }
}


// Optional: Function to get data from the sheet (for debugging or other purposes)
async function accessSheetData() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: "./google-credentials.json",
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    
    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: authClient });
    
    const spreadsheetId = "1wAiD2D_UmKc68LgkVdTMn1Qh7TcqVbYSU37LWImL9ME"; // Your spreadsheet ID
    const range = "Sheet1"; // Adjust as needed
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });
    console.log("Sheet Data:", response.data.values);
    return response.data.values;
  } catch (error) {
    console.error("Error fetching data from Google Sheets:", error);
    return null;
  }
}

// Start Server
app.listen(3000, () => console.log('Server running on port 3000'));
