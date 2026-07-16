import json
from datetime import timedelta

from django.contrib.auth.hashers import check_password, make_password
from django.core.mail import send_mail
from django.db import transaction
from django.db.models import Sum, Count, F
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from rest_framework import viewsets, mixins

from . import paypal
from .auth import require_admin, rate_limit, get_admin_session, IsAdminOrReadOnly, IsAdmin
from .models import AdminUser, AdminSession, Product, Order, OrderItem, Delivery, Activity, PaymentDetails, Payment
from .serializers import ProductSerializer, OrderSerializer, PaymentSerializer


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _body(request):
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return {}


def log_activity(activity_type, description):
    return Activity.objects.create(type=activity_type, description=description)


def _send_email(subject, message, to_email):
    """Sends real email when SMTP is configured; otherwise this is a no-op
    and the caller still logs the attempt to the activity feed."""
    from django.conf import settings

    if not settings.EMAIL_ENABLED or not settings.EMAIL_HOST:
        return False
    try:
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [to_email], fail_silently=True)
        return True
    except Exception:
        return False


def notify_admin_new_order(order):
    payload = {
        "to": "admin",
        "subject": f"New order request #{order.id}",
        "summary": f"{order.customer_name} placed an order for ${order.total_amount:.2f} AUD via {order.get_payment_method_display()}.",
    }
    from django.conf import settings

    _send_email(payload["subject"], payload["summary"], settings.ADMIN_NOTIFICATION_EMAIL)
    log_activity("email_sent", json.dumps(payload))


def notify_customer_order_confirmation(order):
    payload = {
        "to": order.customer_email,
        "subject": f"Your Glow State Peptides order #{order.id} was received",
        "summary": f"Thanks {order.customer_name}, we received your order for ${order.total_amount:.2f} AUD. We'll be in touch with payment details shortly.",
    }
    _send_email(payload["subject"], payload["summary"], order.customer_email)
    log_activity("email_sent", json.dumps(payload))


def notify_status_update(order, note):
    payload = {
        "to": order.customer_email,
        "subject": f"Order #{order.id} update",
        "summary": note,
    }
    _send_email(payload["subject"], payload["summary"], order.customer_email)
    log_activity("email_sent", json.dumps(payload))


# ---------------------------------------------------------------------------
# 1. Admin authentication
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(["POST"])
@rate_limit("login", max_attempts=10, window_seconds=60)
def auth_login(request):
    data = _body(request)
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return JsonResponse({"error": "Username and password are required."}, status=400)

    try:
        user = AdminUser.objects.get(username=username)
    except AdminUser.DoesNotExist:
        return JsonResponse({"error": "Invalid admin username or password."}, status=401)

    if not check_password(password, user.password_hash):
        return JsonResponse({"error": "Invalid admin username or password."}, status=401)

    session = AdminSession.objects.create(
        admin_user=user, expires_at=timezone.now() + timedelta(days=7)
    )
    log_activity("admin_login", f"Admin user '{username}' successfully authenticated.")
    return JsonResponse({"token": session.token, "username": user.username})


@csrf_exempt
@require_http_methods(["GET"])
def auth_me(request):
    session = get_admin_session(request)
    if session is None:
        return JsonResponse({"authorized": False}, status=401)
    return JsonResponse({"username": session.admin_user.username, "authorized": True})


@csrf_exempt
@require_http_methods(["POST"])
@require_admin
def auth_change_password(request):
    data = _body(request)
    username = data.get("username")
    current_password = data.get("current_password")
    new_password = data.get("new_password")

    if not username or not current_password or not new_password:
        return JsonResponse(
            {"error": "Username, current password, and new password are required."}, status=400
        )

    try:
        user = AdminUser.objects.get(username=username)
    except AdminUser.DoesNotExist:
        return JsonResponse({"error": "Admin user not found."}, status=400)

    if not check_password(current_password, user.password_hash):
        return JsonResponse({"error": "Current password is incorrect."}, status=400)

    if len(new_password) < 8:
        return JsonResponse({"error": "New password must be at least 8 characters."}, status=400)

    user.password_hash = make_password(new_password)
    user.save(update_fields=["password_hash"])
    log_activity("admin_password_change", f"Admin user '{username}' updated their password.")
    return JsonResponse({"success": True})


# ---------------------------------------------------------------------------
# 2. Product catalog
# ---------------------------------------------------------------------------

REQUIRED_PRODUCT_FIELDS = ["name", "description", "price", "image_url", "category", "stock"]


@csrf_exempt
@require_http_methods(["GET", "POST"])
def products_collection(request):
    if request.method == "GET":
        products = Product.objects.all().order_by("-id")
        return JsonResponse([p.to_dict() for p in products], safe=False)

    # POST — admin only
    session = get_admin_session(request)
    if session is None:
        return JsonResponse({"error": "Unauthorized administrative access."}, status=401)

    data = _body(request)
    if any(data.get(f) in (None, "") for f in REQUIRED_PRODUCT_FIELDS):
        return JsonResponse(
            {"error": "All product details are required (name, description, price, image_url, category, stock)."},
            status=400,
        )

    product = Product.objects.create(
        name=data["name"],
        description=data["description"],
        price=data["price"],
        image_url=data["image_url"],
        is_best_selling=bool(data.get("is_best_selling", False)),
        is_discounted=bool(data.get("is_discounted", False)),
        discount_price=data.get("discount_price") or None,
        category=data["category"],
        stock=data["stock"],
    )
    log_activity("product_added", f"Admin added new product: {product.name}")
    return JsonResponse(product.to_dict(), status=201)


@csrf_exempt
@require_http_methods(["GET", "PUT", "DELETE"])
def product_detail(request, product_id):
    try:
        product = Product.objects.get(id=product_id)
    except Product.DoesNotExist:
        return JsonResponse({"error": "Product not found."}, status=404)

    if request.method == "GET":
        return JsonResponse(product.to_dict())

    session = get_admin_session(request)
    if session is None:
        return JsonResponse({"error": "Unauthorized administrative access."}, status=401)

    if request.method == "PUT":
        data = _body(request)
        for field in ["name", "description", "image_url", "category"]:
            if data.get(field) is not None:
                setattr(product, field, data[field])
        if data.get("price") is not None:
            product.price = data["price"]
        if data.get("stock") is not None:
            product.stock = data["stock"]
        if "is_best_selling" in data and data["is_best_selling"] is not None:
            product.is_best_selling = bool(data["is_best_selling"])
        if "is_discounted" in data and data["is_discounted"] is not None:
            product.is_discounted = bool(data["is_discounted"])
        if "discount_price" in data:
            product.discount_price = data["discount_price"] or None
        product.save()
        log_activity("product_updated", f"Admin updated product details: {product.name}")
        return JsonResponse(product.to_dict())

    # DELETE
    name = product.name
    product.delete()
    log_activity("product_deleted", f"Admin deleted product: {name}")
    return JsonResponse({"message": "Product successfully deleted."})


# ---------------------------------------------------------------------------
# 3. Orders
# ---------------------------------------------------------------------------

REQUIRED_ORDER_FIELDS = [
    "customer_name", "customer_email", "customer_address",
    "payment_method", "total_amount", "items",
]


@csrf_exempt
@require_http_methods(["GET", "POST"])
def orders_collection(request):
    if request.method == "POST":
        data = _body(request)
        missing = any(data.get(f) in (None, "") for f in REQUIRED_ORDER_FIELDS[:-1])
        items = data.get("items")
        if missing or not isinstance(items, list) or len(items) == 0:
            return JsonResponse(
                {"error": "Missing required order fields (customer_name, customer_email, customer_address, payment_method, total_amount, items)."},
                status=400,
            )

        with transaction.atomic():
            order = Order.objects.create(
                customer_name=data["customer_name"],
                customer_email=data["customer_email"],
                customer_address=data["customer_address"],
                payment_method=data["payment_method"],
                total_amount=data["total_amount"],
                status="pending",
            )
            for item in items:
                product_id = int(item.get("product_id"))
                product = Product.objects.filter(id=product_id).first()
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    product_id_snapshot=product_id,
                    product_name=item.get("product_name", ""),
                    quantity=int(item.get("quantity", 0)),
                    price=item.get("price", 0),
                )
                if product:
                    product.stock = max(0, product.stock - int(item.get("quantity", 0)))
                    product.save(update_fields=["stock"])

        log_activity(
            "order_request",
            f"New order request placed by {order.customer_name} via "
            f"{order.get_payment_method_display()} (Total: ${float(order.total_amount):.2f} AUD).",
        )
        notify_admin_new_order(order)
        notify_customer_order_confirmation(order)
        return JsonResponse(order.to_dict(), status=201)

    # GET — admin only
    session = get_admin_session(request)
    if session is None:
        return JsonResponse({"error": "Unauthorized administrative access."}, status=401)

    orders = Order.objects.all().order_by("-id").prefetch_related("items")
    return JsonResponse([o.to_dict() for o in orders], safe=False)


@csrf_exempt
@require_http_methods(["PUT"])
@require_admin
def order_update_status(request, order_id):
    data = _body(request)
    status = data.get("status")
    if not status:
        return JsonResponse({"error": "Status is required."}, status=400)

    try:
        order = Order.objects.get(id=order_id)
    except Order.DoesNotExist:
        return JsonResponse({"error": "Order not found."}, status=404)

    order.status = status
    order.save(update_fields=["status"])
    log_activity("order_updated", f"Order ID #{order_id} status updated to: {status.replace('_', ' ')}")
    notify_status_update(order, f"Status updated to {status}")
    return JsonResponse(order.to_dict())


# ---------------------------------------------------------------------------
# 4. Activity log
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(["GET"])
@require_admin
def activities_list(request):
    activities = Activity.objects.all().order_by("-id")[:100]
    return JsonResponse([a.to_dict() for a in activities], safe=False)


# ---------------------------------------------------------------------------
# 5. Email preview
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(["GET"])
@require_admin
def email_preview(request):
    activities = Activity.objects.filter(type="email_sent").order_by("-id")[:100]
    emails = []
    for a in activities:
        try:
            parsed = json.loads(a.description)
        except json.JSONDecodeError:
            continue
        emails.append({"id": a.id, "created_at": a.created_at.isoformat(), **parsed})
    return JsonResponse(emails, safe=False)


# ---------------------------------------------------------------------------
# 6. Deliveries (additive — admin managed)
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(["GET", "POST"])
@require_admin
def deliveries_collection(request):
    if request.method == "GET":
        deliveries = Delivery.objects.select_related("order").all().order_by("-id")
        return JsonResponse([d.to_dict() for d in deliveries], safe=False)

    data = _body(request)
    order_id = data.get("order_id")
    address = data.get("address")
    if not order_id or not address:
        return JsonResponse({"error": "order_id and address are required."}, status=400)

    try:
        order = Order.objects.get(id=order_id)
    except Order.DoesNotExist:
        return JsonResponse({"error": "Order not found."}, status=404)

    delivery, created = Delivery.objects.update_or_create(
        order=order,
        defaults={
            "address": address,
            "status": data.get("status", "pending"),
            "carrier": data.get("carrier", ""),
            "tracking_number": data.get("tracking_number", ""),
            "notes": data.get("notes", ""),
        },
    )
    log_activity(
        "delivery_added" if created else "delivery_updated",
        f"Admin {'added' if created else 'updated'} delivery details for order #{order.id}.",
    )
    return JsonResponse(delivery.to_dict(), status=201 if created else 200)


@csrf_exempt
@require_http_methods(["GET", "PUT"])
@require_admin
def delivery_detail(request, delivery_id):
    try:
        delivery = Delivery.objects.get(id=delivery_id)
    except Delivery.DoesNotExist:
        return JsonResponse({"error": "Delivery not found."}, status=404)

    if request.method == "GET":
        return JsonResponse(delivery.to_dict())

    data = _body(request)
    for field in ["address", "carrier", "tracking_number", "notes"]:
        if data.get(field) is not None:
            setattr(delivery, field, data[field])
    if data.get("status") is not None:
        delivery.status = data["status"]
    delivery.save()
    log_activity("delivery_updated", f"Admin updated delivery for order #{delivery.order_id}.")
    return JsonResponse(delivery.to_dict())


@csrf_exempt
@require_http_methods(["PUT"])
@require_admin
def delivery_update_status(request, delivery_id):
    data = _body(request)
    status = data.get("status")
    if not status:
        return JsonResponse({"error": "Status is required."}, status=400)

    try:
        delivery = Delivery.objects.get(id=delivery_id)
    except Delivery.DoesNotExist:
        return JsonResponse({"error": "Delivery not found."}, status=404)

    delivery.status = status
    delivery.save(update_fields=["status", "updated_at"])
    log_activity("delivery_updated", f"Delivery for order #{delivery.order_id} marked as {status}.")
    return JsonResponse(delivery.to_dict())


# ---------------------------------------------------------------------------
# 7. Customers (derived from order history — additive)
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(["GET"])
@require_admin
def customers_list(request):
    orders = Order.objects.all().order_by("created_at")
    customers = {}
    for o in orders:
        c = customers.setdefault(
            o.customer_email,
            {
                "customer_email": o.customer_email,
                "customer_name": o.customer_name,
                "address": o.customer_address,
                "total_orders": 0,
                "total_spent": 0.0,
            },
        )
        c["customer_name"] = o.customer_name
        c["address"] = o.customer_address
        c["total_orders"] += 1
        c["total_spent"] += float(o.total_amount)

    result = sorted(customers.values(), key=lambda c: c["total_spent"], reverse=True)
    return JsonResponse(result, safe=False)


# ---------------------------------------------------------------------------
# 8. Sales analytics (additive)
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(["GET"])
@require_admin
def analytics_best_sellers(request):
    rows = (
        OrderItem.objects.values("product_id_snapshot", "product_name")
        .annotate(units_sold=Sum("quantity"), revenue=Sum(F("price") * F("quantity")))
        .order_by("-units_sold")[:20]
    )
    data = [
        {
            "product_id": r["product_id_snapshot"],
            "product_name": r["product_name"],
            "units_sold": r["units_sold"] or 0,
            "revenue": float(r["revenue"] or 0),
        }
        for r in rows
    ]
    return JsonResponse(data, safe=False)


@csrf_exempt
@require_http_methods(["GET"])
@require_admin
def analytics_sales(request):
    total_orders = Order.objects.count()
    total_revenue = Order.objects.aggregate(total=Sum("total_amount"))["total"] or 0
    by_status = list(Order.objects.values("status").annotate(count=Count("id")))
    return JsonResponse(
        {
            "total_orders": total_orders,
            "total_revenue": float(total_revenue),
            "orders_by_status": by_status,
        }
    )


# ---------------------------------------------------------------------------
# 9. Payment details (bank transfer + PayPal) — publicly readable, editable
#    only via Django admin as required.
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(["GET"])
def payment_details(request):
    details = PaymentDetails.load()
    return JsonResponse(details.to_dict())


# ---------------------------------------------------------------------------
# 10. PayPal Checkout (real PayPal Orders v2 API — not a placeholder)
# ---------------------------------------------------------------------------

@csrf_exempt
@require_http_methods(["POST"])
def paypal_create_order(request):
    data = _body(request)
    order_id = data.get("order_id")
    if not order_id:
        return JsonResponse({"error": "order_id is required."}, status=400)

    try:
        order = Order.objects.get(id=order_id)
    except Order.DoesNotExist:
        return JsonResponse({"error": "Order not found."}, status=404)

    try:
        paypal_order = paypal.create_order(float(order.total_amount), reference_id=order.id)
    except paypal.PayPalError as exc:
        return JsonResponse({"error": str(exc)}, status=502)

    return JsonResponse({"paypal_order_id": paypal_order["id"]})


@csrf_exempt
@require_http_methods(["POST"])
def paypal_capture_order(request):
    data = _body(request)
    order_id = data.get("order_id")
    paypal_order_id = data.get("paypal_order_id")
    if not order_id or not paypal_order_id:
        return JsonResponse({"error": "order_id and paypal_order_id are required."}, status=400)

    try:
        order = Order.objects.get(id=order_id)
    except Order.DoesNotExist:
        return JsonResponse({"error": "Order not found."}, status=404)

    try:
        capture = paypal.capture_order(paypal_order_id)
    except paypal.PayPalError as exc:
        return JsonResponse({"error": str(exc)}, status=502)

    status = capture.get("status")
    if status != "COMPLETED":
        return JsonResponse({"error": f"PayPal payment not completed (status: {status})."}, status=402)

    transaction_id = paypal_order_id
    try:
        transaction_id = (
            capture["purchase_units"][0]["payments"]["captures"][0]["id"]
        )
    except (KeyError, IndexError):
        pass

    order.status = "paid"
    order.transaction_id = transaction_id
    order.paid_at = timezone.now()
    order.save(update_fields=["status", "transaction_id", "paid_at"])

    log_activity(
        "order_paid",
        f"Order #{order.id} paid via PayPal. Transaction ID: {transaction_id}.",
    )
    notify_status_update(order, f"Payment received via PayPal (transaction {transaction_id}). Your order is now being processed.")

    return JsonResponse(order.to_dict())


# ---------------------------------------------------------------------------
# 11. Django REST Framework ModelViewSets — /api/products/, /api/orders/,
#     /api/payments/. These sit alongside the plain-view endpoints above
#     (which the existing storefront checkout/admin UI already uses at
#     non-trailing-slash paths) and give a fully DRF-powered REST surface
#     over the exact same models/database.
# ---------------------------------------------------------------------------

class ProductViewSet(viewsets.ModelViewSet):
    """Full CRUD: GET is public, POST/PUT/PATCH/DELETE require an admin
    Bearer token (same AdminSession auth as the rest of the API)."""

    queryset = Product.objects.all().order_by("-id")
    serializer_class = ProductSerializer
    permission_classes = [IsAdminOrReadOnly]

    def perform_create(self, serializer):
        product = serializer.save()
        log_activity("product_added", f"Admin added new product: {product.name}")

    def perform_update(self, serializer):
        product = serializer.save()
        log_activity("product_updated", f"Admin updated product details: {product.name}")

    def perform_destroy(self, instance):
        name = instance.name
        instance.delete()
        log_activity("product_deleted", f"Admin deleted product: {name}")


class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin,
                    mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Admin-only access to orders: list/retrieve/update (status changes).
    Order *creation* stays on POST /api/orders (no trailing slash) since it
    needs to run the multi-item cart + stock-deduction + email-notification
    logic already implemented in orders_collection() above — duplicating
    that here would risk the two code paths drifting out of sync."""

    queryset = Order.objects.all().order_by("-id").prefetch_related("items")
    serializer_class = OrderSerializer
    permission_classes = [IsAdmin]

    def perform_update(self, serializer):
        order = serializer.save()
        log_activity("order_updated", f"Order ID #{order.id} status updated to: {order.status.replace('_', ' ')}")


class PaymentViewSet(viewsets.ModelViewSet):
    """Admin-only. Lets an admin record/reconcile a payment against an order
    (e.g. a manual bank transfer confirmation), or inspect PayPal captures.
    Marks the related order as 'paid' when a payment is created as
    'completed'."""

    queryset = Payment.objects.all().order_by("-id")
    serializer_class = PaymentSerializer
    permission_classes = [IsAdmin]

    def perform_create(self, serializer):
        payment = serializer.save()
        if payment.status == "completed":
            order = payment.order
            order.status = "paid"
            order.transaction_id = payment.transaction_id or order.transaction_id
            order.paid_at = timezone.now()
            order.save(update_fields=["status", "transaction_id", "paid_at"])
        log_activity(
            "payment_recorded",
            f"Admin recorded a {payment.get_status_display().lower()} payment of "
            f"${float(payment.amount):.2f} AUD for order #{payment.order_id}.",
        )
