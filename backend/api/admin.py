from django.contrib import admin
from .models import AdminUser, AdminSession, Product, Order, OrderItem, Delivery, Activity, PaymentDetails, Payment

# Note: Coupon is intentionally NOT registered here — SALE30 is a fixed,
# code-defined discount (30% off, auto-expires 7 days after the migration
# that creates it runs). It isn't meant to be edited from the admin panel.

admin.site.register(AdminUser)
admin.site.register(AdminSession)
admin.site.register(Product)
admin.site.register(Order)
admin.site.register(OrderItem)
admin.site.register(Payment)
admin.site.register(Delivery)
admin.site.register(Activity)


@admin.register(PaymentDetails)
class PaymentDetailsAdmin(admin.ModelAdmin):
    """Editable in Django admin, as required. Singleton — only one row."""
    list_display = ("account_name", "bank_name", "bsb", "account_number", "payid_number", "payid_name", "paypal_email")

    def has_add_permission(self, request):
        return not PaymentDetails.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
