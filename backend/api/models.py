import secrets
from datetime import timedelta

from django.db import models
from django.utils import timezone


class AdminUser(models.Model):
    """Mirrors the original admin_users table (username + hashed password)."""
    username = models.CharField(max_length=150, unique=True)
    password_hash = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.username


class AdminSession(models.Model):
    """Server-side session token issued on login, sent back as a Bearer token."""
    token = models.CharField(max_length=64, unique=True, default=secrets.token_hex)
    admin_user = models.ForeignKey(AdminUser, on_delete=models.CASCADE, related_name="sessions")
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(days=7)
        super().save(*args, **kwargs)

    def is_valid(self):
        return timezone.now() < self.expires_at


class Product(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField()
    price = models.DecimalField(max_digits=10, decimal_places=2)
    image_url = models.TextField()
    is_best_selling = models.BooleanField(default=False)
    is_discounted = models.BooleanField(default=False)
    discount_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    category = models.CharField(max_length=150)
    stock = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "price": float(self.price),
            "image_url": self.image_url,
            "is_best_selling": self.is_best_selling,
            "is_discounted": self.is_discounted,
            "discount_price": float(self.discount_price) if self.discount_price is not None else None,
            "category": self.category,
            "stock": self.stock,
            "created_at": self.created_at.isoformat(),
        }


class Order(models.Model):
    PAYMENT_CHOICES = [
        ("bank_transfer", "Bank Transfer"),
        ("paypal_invoice", "PayPal Invoice"),
    ]
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("invoice_sent", "Invoice Sent"),
        ("paid", "Paid"),
        ("shipped", "Shipped"),
        ("cancelled", "Cancelled"),
    ]

    customer_name = models.CharField(max_length=255)
    customer_email = models.EmailField()
    customer_address = models.TextField()
    payment_method = models.CharField(max_length=30, choices=PAYMENT_CHOICES)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="pending")
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    transaction_id = models.CharField(max_length=100, blank=True, default="")
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def to_dict(self, include_items=True):
        data = {
            "id": self.id,
            "customer_name": self.customer_name,
            "customer_email": self.customer_email,
            "customer_address": self.customer_address,
            "payment_method": self.payment_method,
            "status": self.status,
            "total_amount": float(self.total_amount),
            "transaction_id": self.transaction_id,
            "paid_at": self.paid_at.isoformat() if self.paid_at else None,
            "created_at": self.created_at.isoformat(),
        }
        if include_items:
            data["items"] = [item.to_dict() for item in self.items.all()]
        return data


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True, blank=True, related_name="order_items")
    product_id_snapshot = models.IntegerField()
    product_name = models.CharField(max_length=255)
    quantity = models.IntegerField()
    price = models.DecimalField(max_digits=10, decimal_places=2)

    def to_dict(self):
        return {
            "id": self.id,
            "order_id": self.order_id,
            "product_id": self.product_id_snapshot,
            "product_name": self.product_name,
            "quantity": self.quantity,
            "price": float(self.price),
        }


class Payment(models.Model):
    """Individual payment records against an order (bank transfer confirmation
    or PayPal capture). Additive to Order.status/transaction_id — gives a
    full audit trail when an order is paid in multiple steps or reconciled
    manually by an admin."""

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("completed", "Completed"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="payments")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=30, choices=Order.PAYMENT_CHOICES, default="bank_transfer")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    transaction_id = models.CharField(max_length=100, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    def to_dict(self):
        return {
            "id": self.id,
            "order_id": self.order_id,
            "amount": float(self.amount),
            "method": self.method,
            "status": self.status,
            "transaction_id": self.transaction_id,
            "created_at": self.created_at.isoformat(),
        }


class Delivery(models.Model):
    """Delivery tracking, additive to the order model (admin-only feature)."""
    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("shipped", "Shipped"),
        ("delivered", "Delivered"),
    ]

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name="delivery")
    address = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    carrier = models.CharField(max_length=150, blank=True, default="")
    tracking_number = models.CharField(max_length=150, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def to_dict(self):
        return {
            "id": self.id,
            "order_id": self.order_id,
            "address": self.address,
            "status": self.status,
            "carrier": self.carrier,
            "tracking_number": self.tracking_number,
            "notes": self.notes,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class PaymentDetails(models.Model):
    """Singleton row holding the payment info shown on the storefront.
    Editable from Django admin — changes are reflected on the frontend
    checkout page immediately via GET /api/payment-details."""

    bank_name = models.CharField(max_length=150, default="Commonwealth Bank")
    account_name = models.CharField(max_length=150, default="Glow State")
    bsb = models.CharField(max_length=20, default="064 437")
    account_number = models.CharField(max_length=40, default="10013757")
    paypal_email = models.EmailField(default="Glowstatepeps@hotmail.com")
    paypal_client_id = models.CharField(
        max_length=255,
        blank=True,
        default="",
        help_text="Public PayPal REST API client ID (sandbox or live) used to load the JS SDK on the storefront.",
    )

    class Meta:
        verbose_name = "Payment Details"
        verbose_name_plural = "Payment Details"

    def __str__(self):
        return f"Payment Details ({self.account_name})"

    def save(self, *args, **kwargs):
        self.pk = 1  # enforce singleton
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass  # prevent deletion of the singleton row

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def to_dict(self):
        return {
            "bank_name": self.bank_name,
            "account_name": self.account_name,
            "bsb": self.bsb,
            "account_number": self.account_number,
            "paypal_email": self.paypal_email,
            "paypal_client_id": self.paypal_client_id,
        }


class Activity(models.Model):
    type = models.CharField(max_length=50)
    description = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def to_dict(self):
        return {
            "id": self.id,
            "type": self.type,
            "description": self.description,
            "created_at": self.created_at.isoformat(),
        }
