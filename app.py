import os
import json
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template, request, redirect, url_for, session
from flask_login import LoginManager, current_user, login_required, login_user, logout_user, UserMixin
from google.oauth2 import service_account
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import Flow
import logging
import requests
import pytz

# --- Basic Logging Setup ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Configuration ---
DATABASE_SHEET_ID = '1ZufXPOUcoW2czQ0vcpZwvJNHngV4GHbbSl9q46UwF8g'
DATABASE_SHEET_NAME = 'DATABASE' # Define sheet name for clarity
LOGS_SHEET_ID = '1ZufXPOUcoW2czQ0vcpZwvJNHngV4GHbbSl9q46UwF8g'
LOGS_SHEET_NAME = 'Web App Logs' # Define sheet name for clarity
SCOPES_SERVICE_ACCOUNT = ['https://www.googleapis.com/auth/spreadsheets']
SPECIAL_USER_EMAILS = ['harrypobreza@gmail.com', 'official.tutansradio@gmail.com']
YOUR_TIMEZONE = 'Asia/Manila'

# --- Flask App Initialization ---
app = Flask(__name__)
app.secret_key = os.urandom(24)

# (The rest of your authentication and helper functions remain the same)
# ...
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "login"
class User(UserMixin):
    def __init__(self, id, name, email, is_special=False):
        self.id, self.name, self.email, self.is_special = id, name, email, is_special
users = {}
@login_manager.user_loader
def load_user(user_id):
    return users.get(user_id)
CLIENT_SECRET_FILE = 'client_secret.json'
SCOPES_OAUTH = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email', 'openid']
creds_service_account = None
try:
    if 'GOOGLE_CREDENTIALS_JSON' in os.environ:
        creds_json = json.loads(os.environ.get('GOOGLE_CREDENTIALS_JSON'))
        creds_service_account = service_account.Credentials.from_service_account_info(creds_json, scopes=SCOPES_SERVICE_ACCOUNT)
    else:
        KEY_FILE_LOCATION = os.path.join(os.path.dirname(__file__), 'credentials.json')
        creds_service_account = service_account.Credentials.from_service_account_file(KEY_FILE_LOCATION, scopes=SCOPES_SERVICE_ACCOUNT)
    service = build('sheets', 'v4', credentials=creds_service_account)
    sheet_api = service.spreadsheets()
    logging.info("Successfully connected to Google Sheets API.")
except Exception as e:
    logging.error(f"FATAL ERROR: Could not load Google Sheets credentials. {e}")
    sheet_api = None
def to_float(value):
    if isinstance(value, (int, float)): return float(value)
    if not isinstance(value, str): return 0.0
    cleaned_value = value.strip().replace('₱', '').replace(',', '')
    if not cleaned_value: return 0.0
    try: return float(cleaned_value)
    except (ValueError, TypeError): return 0.0
def get_all_sheet_data(sheet_id, sheet_name):
    if not sheet_api: return None
    try:
        # Fetch the entire sheet data
        result = sheet_api.values().get(spreadsheetId=sheet_id, range=f"{sheet_name}!A:L").execute()
        return result.get('values', [])
    except Exception as e:
        logging.error(f"Error fetching sheet data: {e}")
        return None
def calculate_date_range(month_name, week_str):
    try:
        month_map = { "January": 1, "February": 2, "March": 3, "April": 4, "May": 5, "June": 6, "July": 7, "August": 8, "September": 9, "October": 10, "November": 11, "December": 12 }
        target_month_index = month_map.get(month_name)
        week_num = int(week_str.replace('Week ', ''))
        if not target_month_index or week_num < 1: return ""
        year = datetime.now().year
        first_day_of_month = datetime(year, target_month_index, 1)
        days_to_subtract_for_monday = first_day_of_month.weekday()
        week1_start_date = first_day_of_month - timedelta(days=days_to_subtract_for_monday)
        selected_week_start_date = week1_start_date + timedelta(weeks=week_num - 1)
        selected_week_end_date = selected_week_start_date + timedelta(days=6)
        start_month_name, end_month_name = selected_week_start_date.strftime("%B").upper(), selected_week_end_date.strftime("%B").upper()
        if start_month_name == end_month_name:
            return f"{start_month_name} {selected_week_start_date.day} - {selected_week_end_date.day}"
        else:
            return f"{start_month_name} {selected_week_start_date.day} - {end_month_name} {selected_week_end_date.day}"
    except Exception as e:
        logging.error(f"Error in calculate_date_range: {e}")
        return ""
@app.route('/')
@login_required
def index():
    return render_template('index.html')
@app.route('/login')
def login():
    return """
        <!DOCTYPE html><html><head><title>Login</title><meta name="viewport" content="width=device-width, initial-scale=1.0"><style>body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100vh; background-color: #121212; color: #e0e0e0; margin: 0; } h1 { font-weight: 500; margin-bottom: 2rem; } a { display: inline-flex; align-items: center; gap: 12px; background-color: #FFFFFF; color: #1f2937; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 500; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); transition: transform 0.2s; } a:hover { transform: translateY(-2px); } img { width: 24px; height: 24px; }</style></head><body><h1>Dashboard Login</h1><a href="/authorize"><img src="https://developers.google.com/identity/images/g-logo.png" alt="Google logo">Sign In with Google</a></body></html>
    """
@app.route("/authorize")
def authorize():
    if not os.path.exists(CLIENT_SECRET_FILE): return "Error: client_secret.json not found.", 500
    flow = Flow.from_client_secrets_file(CLIENT_SECRET_FILE, scopes=SCOPES_OAUTH, redirect_uri=url_for('callback', _external=True))
    authorization_url, state = flow.authorization_url()
    session["state"] = state
    return redirect(authorization_url)
@app.route("/callback")
def callback():
    flow = Flow.from_client_secrets_file(CLIENT_SECRET_FILE, scopes=SCOPES_OAUTH, state=session["state"], redirect_uri=url_for('callback', _external=True))
    flow.fetch_token(authorization_response=request.url)
    credentials = flow.credentials
    user_info_response = requests.get('https://www.googleapis.com/oauth2/v3/userinfo', headers={'Authorization': f'Bearer {credentials.token}'})
    user_info = user_info_response.json()
    user_id, user_email, user_name = user_info.get('sub'), user_info.get('email', '').lower(), user_info.get('name')
    is_special = user_email in [email.lower() for email in SPECIAL_USER_EMAILS]
    user = User(id=user_id, name=user_name, email=user_email, is_special=is_special)
    users[user_id] = user
    login_user(user)
    return redirect(url_for('index'))
@app.route("/logout")
@login_required
def logout():
    logout_user()
    return redirect(url_for('login'))
@app.route('/api/user-info', methods=['GET'])
@login_required
def get_user_info():
    return jsonify({
        "email": current_user.email,
        "name": current_user.name,
        "isSpecial": current_user.is_special
    })
@app.route('/api/ba-names', methods=['GET'])
@login_required
def get_unique_ba_names():
    try:
        data = get_all_sheet_data(DATABASE_SHEET_ID, DATABASE_SHEET_NAME)
        if not data or len(data) <= 1: return jsonify([])
        ba_names = set(row[3].strip() for row in data[1:] if len(row) > 3 and row[3])
        return jsonify(sorted(list(ba_names)))
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/search', methods=['POST'])
@login_required
def search_dashboard_data():
    req_data = request.get_json()
    month, week, ba_names, palcode = req_data.get('month'), req_data.get('week'), req_data.get('baNames', []), req_data.get('palcode', '')
    is_special_user = current_user.is_special
    
    if not month or not week: return jsonify({"error": "Month and Week are required."}), 400
    if not is_special_user and not ba_names: return jsonify({"error": "BA Name is required."}), 400
    
    all_sheet_data = get_all_sheet_data(DATABASE_SHEET_ID, DATABASE_SHEET_NAME)
    if all_sheet_data is None: return jsonify({"error": "Database sheet not found or API failed."}), 500
        
    log_user_event('searchDashboardData', req_data)
    search_month, search_week = month.strip().lower(), week.strip().lower()
    search_ba_names_lower = [str(name).strip().lower() for name in ba_names if name]
    search_palcode_lower = palcode.strip().lower() if palcode else ""
    
    # Column indices
    PALCODE, MONTH, WEEK, BA_NAME, REG, VALID_FD, SUSPENDED_FD, RATE, GGR_PER_FD, TOTAL_GGR, SALARY, STATUS = 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
    
    period_data_rows = [row for row in all_sheet_data[1:] if len(row) > WEEK and row[MONTH].strip().lower() == search_month and row[WEEK].strip().lower() == search_week]
    
    ba_display_name = "ALL BAs" if is_special_user and not search_ba_names_lower else (f"MULTIPLE BAs ({len(search_ba_names_lower)})" if len(search_ba_names_lower) > 1 else (ba_names[0].strip().upper() if search_ba_names_lower else "N/A"))
    search_criteria_frontend = {'baNames': [name.strip().upper() for name in ba_names]}
    date_range_display = calculate_date_range(month, week)
    
    utc_now = datetime.now(pytz.utc)
    local_tz = pytz.timezone(YOUR_TIMEZONE)
    local_now = utc_now.astimezone(local_tz)
    last_update_timestamp = local_now.strftime('%A, %B %d, %Y, %I:%M:%S %p')

    if not period_data_rows:
        return jsonify({ "baNameDisplay": ba_display_name, "searchCriteria": search_criteria_frontend, "summary": {"totalRegistration": 0, "totalValidFd": 0, "totalSuspended": 0, "totalSalary": 0, "totalIncentives": 0}, "monthDisplay": search_month.upper(), "weekDisplay": search_week.upper(), "dateRangeDisplay": date_range_display, "status": "N/A", "resultsTable": [], "rankedBaList": [], "lastUpdate": last_update_timestamp, "message": "No records for selected period." })

    overall_total_valid_fd, ba_period_fds = 0, {}
    for row in period_data_rows:
        try:
            current_fd, ba_name = to_float(row[VALID_FD]) if len(row) > VALID_FD else 0, row[BA_NAME].strip() if len(row) > BA_NAME and row[BA_NAME] else "Unknown BA"
            overall_total_valid_fd += current_fd
            if ba_name not in ba_period_fds: ba_period_fds[ba_name] = {"originalName": ba_name, "totalFd": 0}
            ba_period_fds[ba_name]["totalFd"] += current_fd
        except (ValueError, IndexError): continue
    
    final_ranked_ba_list = sorted(ba_period_fds.values(), key=lambda x: x['totalFd'], reverse=True)
    ba_incentives_map, sum_of_all_individual_incentives = {}, 0
    if overall_total_valid_fd >= 6000:
        for i, ba in enumerate(final_ranked_ba_list):
            rank, incentive = i + 1, 0
            if rank == 1: incentive = 3000
            elif rank == 2: incentive = 1500
            elif rank == 3: incentive = 900
            elif 4 <= rank <= 6: incentive = 500
            elif rank > 6 and ba['totalFd'] > 0: incentive = 200
            if incentive > 0:
                ba_incentives_map[ba['originalName'].upper()] = incentive
                sum_of_all_individual_incentives += incentive
    
    filtered_rows = [row for row in period_data_rows if ((not search_ba_names_lower or (len(row) > BA_NAME and row[BA_NAME].strip().lower() in search_ba_names_lower)) and (not search_palcode_lower or (len(row) > PALCODE and row[PALCODE].strip().lower() == search_palcode_lower)))]
    
    results_for_table, summary_for_display = [], {"totalRegistration": 0, "totalValidFd": 0, "totalSuspended": 0, "totalSalary": 0, "totalIncentives": 0}
    
    for row in filtered_rows:
        try:
            # Send the full row data to the frontend
            results_for_table.append(row)
            summary_for_display['totalRegistration'] += to_float(row[REG]) if len(row) > REG else 0
            summary_for_display['totalValidFd'] += to_float(row[VALID_FD]) if len(row) > VALID_FD else 0
            summary_for_display['totalSuspended'] += to_float(row[SUSPENDED_FD]) if len(row) > SUSPENDED_FD else 0
            summary_for_display['totalSalary'] += to_float(row[SALARY]) if len(row) > SALARY else 0
        except IndexError as e: logging.warning(f"Skipping row due to missing columns: {row} -> {e}")
    
    if overall_total_valid_fd >= 6000:
        if search_ba_names_lower: summary_for_display['totalIncentives'] = sum(ba_incentives_map.get(name.upper(), 0) for name in ba_names)
        elif is_special_user: summary_for_display['totalIncentives'] = sum_of_all_individual_incentives
    
    return jsonify({ "baNameDisplay": ba_display_name, "searchCriteria": search_criteria_frontend, "summary": summary_for_display, "monthDisplay": search_month.upper(), "weekDisplay": search_week.upper(), "dateRangeDisplay": date_range_display, "status": "Active", "resultsTable": results_for_table, "rankedBaList": final_ranked_ba_list, "lastUpdate": last_update_timestamp })

# ======================= NEW ROUTE TO SAVE DATA =======================
@app.route('/api/save_dashboard', methods=['POST'])
@login_required
def save_dashboard():
    # Security: Only special users can save data
    if not current_user.is_special:
        return jsonify({"success": False, "error": "Unauthorized"}), 403

    updated_rows_from_client = request.get_json()
    if not updated_rows_from_client:
        return jsonify({"success": False, "error": "No data received"}), 400

    try:
        # 1. Fetch the entire current sheet data to avoid race conditions
        all_sheet_data = get_all_sheet_data(DATABASE_SHEET_ID, DATABASE_SHEET_NAME)
        if not all_sheet_data:
            return jsonify({"success": False, "error": "Could not fetch current database state."}), 500

        # 2. Create a lookup dictionary from the client's updated rows for fast access
        # The key is the PALCODE, which we assume is the unique identifier for a row.
        updates_map = {row['palcode']: row for row in updated_rows_from_client}

        # 3. Iterate through the master sheet data and apply updates
        # Column indices must match your sheet exactly
        PALCODE_COL, MONTH_COL, WEEK_COL, BA_NAME_COL, REG_COL, VALID_FD_COL, SUSPENDED_FD_COL, RATE_COL, GGR_PER_FD_COL, TOTAL_GGR_COL, SALARY_COL, STATUS_COL = 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
        
        has_changes = False
        for i, sheet_row in enumerate(all_sheet_data):
            if i == 0: continue # Skip header row
            if not sheet_row or len(sheet_row) <= PALCODE_COL: continue # Skip empty rows
            
            palcode = sheet_row[PALCODE_COL]
            if palcode in updates_map:
                # An update for this row exists, apply it
                update = updates_map[palcode]
                sheet_row[MONTH_COL] = update['month']
                sheet_row[WEEK_COL] = update['week']
                sheet_row[BA_NAME_COL] = update['ba_name']
                sheet_row[REG_COL] = update['reg']
                sheet_row[VALID_FD_COL] = update['valid_fd']
                sheet_row[SUSPENDED_FD_COL] = update['suspended_fd']
                sheet_row[RATE_COL] = update['rate']
                sheet_row[GGR_PER_FD_COL] = update['ggr_per_fd']
                sheet_row[TOTAL_GGR_COL] = update['total_ggr']
                sheet_row[SALARY_COL] = update['salary']
                sheet_row[STATUS_COL] = update['status']
                has_changes = True

        if not has_changes:
            return jsonify({"success": True, "message": "No changes to save."})

        # 4. Write the entire modified dataset back to the sheet
        # This is safer than updating individual cells as it's a single atomic-like operation.
        range_to_update = f"{DATABASE_SHEET_NAME}!A1"
        body = {'values': all_sheet_data}
        sheet_api.values().update(
            spreadsheetId=DATABASE_SHEET_ID,
            range=range_to_update,
            valueInputOption='USER_ENTERED',
            body=body
        ).execute()

        # 5. Log the successful update event
        log_user_event('saveDashboardData', {'updated_palcodes': list(updates_map.keys())})
        
        return jsonify({"success": True, "message": "Dashboard updated successfully!"})

    except Exception as e:
        logging.error(f"Error saving dashboard data: {e}")
        return jsonify({"success": False, "error": str(e)}), 500
# =========================================================================

def log_user_event(function_name, inputs):
    if not sheet_api: return
    try:
        utc_now = datetime.now(pytz.utc)
        local_tz = pytz.timezone(YOUR_TIMEZONE)
        local_now = utc_now.astimezone(local_tz)
        timestamp = local_now.strftime('%A, %B %d, %Y, %I:%M:%S %p')
        user_email = current_user.email if current_user.is_authenticated else "Anonymous"
        
        if function_name == 'saveDashboardData':
            formatted_inputs = f"Updated {len(inputs.get('updated_palcodes', []))} rows."
        else:
            ba_names_str = ', '.join(inputs.get('baNames', [])) if inputs.get('baNames') else "N/A"
            formatted_inputs = f"Month - {inputs.get('month', 'N/A')}, Week - {inputs.get('week', 'N/A').replace('week ', '')}, Ba Name(s) - {ba_names_str}, Palcode - {inputs.get('palcode', 'N/A') or 'N/A'}"
        
        row_to_append = [timestamp, user_email, function_name, formatted_inputs]
        sheet_api.values().append(spreadsheetId=LOGS_SHEET_ID, range=f'{LOGS_SHEET_NAME}!A1', valueInputOption='USER_ENTERED', body={'values': [row_to_append]}).execute()
    except Exception as e: logging.error(f"Error logging event: {e}")

if __name__ == '__main__':
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
    app.run(host='0.0.0.0', port=5001, debug=True)