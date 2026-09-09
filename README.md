# Kisaan

It's a basic interface between customers and farmers so that there are no middle man in between them making it completely profitable for both customers and farmers.

Targeted for **Smart India Hackathon (SIH 2026)** - Problem Statement SIH26033: *"Multiple intermediaries reduce farmers earnings and increase consumer prices"*.

---

## 🌟 Key Frontend Features

1. **🌾 Direct Farmer Storefront**:
   - Open guest browsing for fresh agricultural produce without forced login barriers.
   - Crop cards showing live farm inventory stock, price per kg, farmer location, Unique Farmer ID, and KYC verified status.
   - Sticky **Configure Order** card with real-time price breakdown (Produce Cost + Transport Fee + Platform Fee = Total).

2. **🚚 Automated Quantity-Based Transport Allocation**:
   - Zero manual customer selection required.
   - Automatically determines optimal transport vehicle based on order payload weight:
     - **$\le 25$ kg**: 🛵 **Bike Express** (₹150)
     - **$26 - 100$ kg**: 🛺 **Auto Cargo / 3-Wheeler** (₹350)
     - **$101 - 500$ kg**: 🚚 **Mini Truck / SCV Pickup** (₹750)
     - **$> 500$ kg**: 🚛 **Commercial Heavy Truck** (₹1,500)
   - Displays a locked `🔒 Auto-Selected by Weight` badge and dynamically recalculates delivery fare.

3. **🤖 AI Demand & Market Price Forecasting Tab**:
   - Compares current Mandi rates vs. Farmer Direct prices vs. AI 7-day predicted target trajectories.
   - Dynamic 7-day price trajectory bar charts for key commodities (Tomatoes, Mangoes, Oranges, Onions).
   - Actionable harvesting guidance for farmers and bulk procurement advice for buyers.

4. **🗺️ AI Multi-Stop Route Optimization & Green Logistics Solver**:
   - Multi-farm pickup sequence solver (Depot $\rightarrow$ Farm 1 $\rightarrow$ Farm 2 $\rightarrow$ APMC Destination Market).
   - Interactive waypoint timeline with departure and arrival ETAs.
   - Real-time calculations of logistics cost savings (₹), fuel saved (L), and $\text{CO}_2$ emissions reduced (kg).

5. **📦 Multi-Farmer Harvest Shortfall Pooling**:
   - When a bulk buyer demands more produce than a primary farmer harvested, the platform automatically aggregates and pools the remaining quantity from neighboring cluster farms.
   - Buyer receives a single delivery while backend generates separate UPI payouts and SMS alerts to each farmer.

6. **👨‍🌾 Farmer Onboarding & FPO (Farmer Producer Organization) Integration**:
   - Farmers register with name, phone, UPI ID, produce listing, and optional FPO affiliation.
   - Auto-assigns Unique Farmer ID (e.g. `KISAN-MH-4019`, `KISAN-PB-3719`).
   - Multipart document upload for KYC proof (Aadhaar / KCC / Land 7/12) and farm photographs.

7. **🔐 Dedicated Login & Anti-Intermediary Verification**:
   - Role selection: Customer vs. Farmer.
   - Customer branching: Bulk retail purchase requires business name, GSTIN/license, and trade document upload to prevent speculative intermediary brokers from trading.

8. **📱 Virtual GSM SMS Simulator Drawer**:
   - Slide-out drawer simulating direct DLT SMS notifications sent to farmers' basic keypad phones.
   - Supports 2-way simulation: "Reply ACCEPT via SMS" or "DECLINE".
   - 4-Digit Delivery OTP verification triggers instant direct-to-bank UPI escrow release.

9. **🎨 Custom UI Theme Switcher**:
   - 🌿 **Emerald Kisaan** (Fresh green agriculture)
   - 🌾 **Harvest Gold** (Warm amber grains)
   - 🪵 **Deep Earth** (Earthy terracotta soil)
   - Selection persists across page reloads via `localStorage`.

---

## 🚀 How to Run Locally

You can run this frontend using any web browser or local static server:

```bash
# Option 1: Using Python
python -m http.server 8080

# Option 2: Using Node npx serve
npx serve .

# Option 3: Double-click index.html to open directly in any browser
```

Backend API endpoints connect to `http://localhost:3000/api/...` when paired with the KisaanDirect backend server.
