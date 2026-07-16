from django.contrib import admin

from .models import AdminUser, AdminSession, Product, Order, OrderItem, Delivery, Activity, PaymentDetails, Payment

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

    list_display = ("account_name", "bank_name", "bsb", "account_number", "paypal_email")

    def has_add_permission(self, request):
        return not PaymentDetails.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
