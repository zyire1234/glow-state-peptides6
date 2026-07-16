from django.urls import path, include
from rest_framework.routers import DefaultRouter

from . import views

# DRF router — exposes the required trailing-slash REST endpoints:
#   /api/products/            (GET list, POST create)
#   /api/products/<id>/       (GET, PUT, PATCH, DELETE)
#   /api/orders/               (GET list — admin)
#   /api/orders/<id>/          (GET, PUT/PATCH status — admin)
#   /api/payments/              (GET list, POST create — admin)
#   /api/payments/<id>/         (GET, PUT, PATCH, DELETE — admin)
router = DefaultRouter()
router.register(r"products", views.ProductViewSet, basename="product")
router.register(r"orders", views.OrderViewSet, basename="order")
router.register(r"payments", views.PaymentViewSet, basename="payment")

urlpatterns = [
    # Auth
    path("auth/login", views.auth_login),
    path("auth/me", views.auth_me),
    path("auth/change-password", views.auth_change_password),

    # Products
    path("products", views.products_collection),
    path("products/<int:product_id>", views.product_detail),

    # Orders
    path("orders", views.orders_collection),
    path("orders/<int:order_id>/status", views.order_update_status),

    # Activities
    path("activities", views.activities_list),

    # Email preview
    path("email-preview", views.email_preview),

    # Deliveries (additive)
    path("deliveries", views.deliveries_collection),
    path("deliveries/<int:delivery_id>", views.delivery_detail),
    path("deliveries/<int:delivery_id>/status", views.delivery_update_status),

    # Customers (additive)
    path("customers", views.customers_list),

    # Analytics (additive)
    path("analytics/best-sellers", views.analytics_best_sellers),
    path("analytics/sales", views.analytics_sales),

    # Payment details (bank transfer + PayPal), dynamic from backend
    path("payment-details", views.payment_details),

    # PayPal Checkout (real Orders v2 API)
    path("paypal/create-order", views.paypal_create_order),
    path("paypal/capture-order", views.paypal_capture_order),
]

# Django REST Framework ModelViewSet routes (trailing-slash REST convention):
# /api/products/, /api/orders/, /api/payments/
urlpatterns += router.urls
