# Privacy Policy — UCP Horizon Notifier

**Last updated: March 2026**

---

## Overview

UCP Horizon Notifier is a Chrome browser extension built for students of the University of Central Punjab. It monitors the UCP Horizon student portal and displays course updates — announcements, materials, submissions, grades, and outlines — in one place.

**This extension does not collect, transmit, store, or share any personal data.**

---

## What data the extension accesses

When you are logged into the UCP Horizon portal, the extension reads the course update pages you already have access to as a student. This includes:

- Announcement titles and descriptions posted by your lecturers
- Course material file names and download links
- Submission names and due dates
- Grade assessment names and results
- Course outline weekly files

This information is read solely to display it back to you inside the extension panel and popup. It is never sent anywhere outside your own device.

---

## Where data is stored

All data is stored locally on your own device using Chrome's built-in `chrome.storage.local` API. This storage is private to your browser profile and is never accessible to any server, third party, or other website.

The following is stored locally:

- Course update items collected during scans
- Your read/unread status for each item
- Your extension settings (e.g. Auto Scan on Login preference)
- The timestamp of the last scan

You can delete all stored data at any time by clicking **Clear all updates** in the extension panel or popup.

---

## What the extension does NOT do

- Does not collect your name, student ID, email address, or any personally identifiable information
- Does not read, store, or transmit your login credentials or password
- Does not track your browsing history or activity outside of horizon.ucp.edu.pk
- Does not use analytics, telemetry, or crash reporting services
- Does not communicate with any external server, API, or cloud service
- Does not inject advertisements or modify Horizon data
- Does not share any data with third parties under any circumstances

---

## Permissions used and why

| Permission | Why it is needed |
|---|---|
| `storage` | Save course updates and read state locally on your device |
| `notifications` | Show a desktop alert when a new course update is detected |
| `tabs` | Detect whether you are on the Horizon dashboard to show the correct buttons |
| `scripting` | Inject the updates panel and badges into the Horizon portal pages |
| `alarms` | Run a background check every 5 minutes on open course tabs |
| `cookies` | Detect when a new login session starts to trigger an automatic scan |
| `host_permissions` (horizon.ucp.edu.pk) | Fetch course pages you are already logged into, to collect update data |

---

## Third-party services

This extension does not use any third-party services, SDKs, libraries loaded from external servers, or analytics platforms. All code runs locally inside your browser.

The popup interface loads the Inter font from Google Fonts for display purposes only. This is a standard stylesheet request and does not involve any user data.

---

## Children's privacy

This extension is intended for university students. It does not knowingly collect any information from children under the age of 13.

---

## Changes to this policy

If this privacy policy changes, the updated version will be published in this file with a revised date at the top. Continued use of the extension after any changes constitutes acceptance of the updated policy.

---

## Contact

If you have questions about this privacy policy or how the extension works, please open an issue in the extension's GitHub repository or contact the developer directly.