# Implementation Plan: Amal Coolguard E-commerce MVP

## Goal
Build a functional e-commerce platform with a focus on an Admin Dashboard for product management and a secure authentication system.

## Priorities
1. **Admin Dashboard**: Implement product CRUD (Create, Read, Update, Delete).
2. **Authentication**: Implement secure Email/Password login for the admin.
3. **Storefront**: Display products added from the dashboard.

## Technical Approach

### 1. Firebase Authentication
- Enable **Email/Password** authentication in the Firebase console.
- Create a dedicated admin login page (`/admin/login`).

### 2. Firestore Schema Update (`firebase-blueprint.json`)
- Define `products` collection with fields: `name`, `description`, `imageUrl`, `price`, `discountPrice`, `stock`, `category`.
- Define `admin` configuration or use a secure list of authorized admin emails stored in a private Firestore document to manage access control.

### 3. Admin Dashboard (`/admin/dashboard`)
- **Product Management**: A UI to list existing products and a form to add/edit products.
- **Product Form**: Fields for all product details. Images will be stored in Firebase Storage (or as URLs for MVP).

### 4. Storefront (`/`)
- Fetch products from Firestore in real-time.
- Responsive grid layout to display products.

## Next Steps
1. Enable Email/Password auth in the Firebase project.
2. Implement admin authentication and protection for the dashboard route.
3. Build the Admin Dashboard UI.
4. Integrate Firestore for product CRUD operations.
5. Update the storefront to display real-time data.
