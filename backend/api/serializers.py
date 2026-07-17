from rest_framework import serializers

from .models import Product, Order, OrderItem, Payment


class ProductSerializer(serializers.ModelSerializer):
    price = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=False)
    discount_price = serializers.DecimalField(
        max_digits=10, decimal_places=2, coerce_to_string=False, required=False, allow_null=True
    )

    class Meta:
        model = Product
        fields = [
            "id", "name", "description", "price", "image_url",
            "is_best_selling", "is_discounted", "discount_price",
            "category", "stock", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class OrderItemSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(source="product_id_snapshot")
    price = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=False)

    class Meta:
        model = OrderItem
        fields = ["id", "order", "product_id", "product_name", "quantity", "price"]
        read_only_fields = ["id", "order"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    total_amount = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=False)

    class Meta:
        model = Order
        fields = [
            "id", "customer_name", "customer_email", "customer_address",
            "payment_method", "status", "total_amount", "transaction_id",
            "paid_at", "created_at", "items",
        ]
        read_only_fields = ["id", "created_at", "paid_at", "items"]


class PaymentSerializer(serializers.ModelSerializer):
    amount = serializers.DecimalField(max_digits=10, decimal_places=2, coerce_to_string=False)

    class Meta:
        model = Payment
        fields = ["id", "order", "amount", "method", "status", "transaction_id", "created_at"]
        read_only_fields = ["id", "created_at"]
