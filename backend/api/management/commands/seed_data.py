from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.management.base import BaseCommand

from api.models import AdminUser, Product, Activity, PaymentDetails

SEED_PRODUCTS = [
    dict(
        name="BPC-157 (Body Protection Compound)",
        description="High-purity BPC-157 peptide (5mg vial). Renowned for its exceptional regenerative properties, gut health support, ligament and tendon healing, and joint recovery acceleration.",
        price=110.00,
        image_url="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=600",
        is_best_selling=True,
        is_discounted=False,
        discount_price=None,
        category="Healing & Recovery",
        stock=25,
    ),
    dict(
        name="TB-500 (Thymosin Beta-4)",
        description="Premium Thymosin Beta-4 peptide (5mg vial). Promotes cellular healing, muscle recovery, tissue repair, and supports flexibility and joint inflammation reduction.",
        price=120.00,
        image_url="https://images.unsplash.com/photo-1576086213369-97a306d36557?auto=format&fit=crop&q=80&w=600",
        is_best_selling=True,
        is_discounted=True,
        discount_price=105.00,
        category="Healing & Recovery",
        stock=18,
    ),
    dict(
        name="CJC-1295 + Ipamorelin Blend",
        description="Perfect synergy combination vial (5mg/5mg). Highly sought after for its anti-aging properties, natural growth hormone support, metabolic improvement, and enhanced sleep quality.",
        price=145.00,
        image_url="https://images.unsplash.com/photo-1532187863486-abf9d39d66e8?auto=format&fit=crop&q=80&w=600",
        is_best_selling=True,
        is_discounted=False,
        discount_price=None,
        category="Anti-Aging & Wellness",
        stock=30,
    ),
    dict(
        name="Melanotan II (Sunsation Peptide)",
        description="Ultra-pure Melanotan II (10mg vial). Promotes skin pigmentation tanning, increases melanin production, and provides protective UV defense for fair skin types.",
        price=95.00,
        image_url="https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&q=80&w=600",
        is_best_selling=False,
        is_discounted=True,
        discount_price=85.00,
        category="Aesthetics",
        stock=15,
    ),
    dict(
        name="Semaglutide Peptide",
        description="Advanced metabolic regulator and GLP-1 receptor agonist peptide (5mg vial). Highly requested for blood sugar regulation, healthy metabolic balance, and sustained appetite control.",
        price=180.00,
        image_url="https://images.unsplash.com/photo-1584017911766-d451b3d0e843?auto=format&fit=crop&q=80&w=600",
        is_best_selling=True,
        is_discounted=False,
        discount_price=None,
        category="Metabolic Support",
        stock=12,
    ),
    dict(
        name="AOD-9604 (Anti-Obesity Drug)",
        description="Advanced lipolytic fragment peptide (5mg vial). Stimulates fat metabolism and fat breakdown (lipolysis) without affecting insulin levels or blood sugar.",
        price=125.00,
        image_url="https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&q=80&w=600",
        is_best_selling=False,
        is_discounted=False,
        discount_price=None,
        category="Metabolic Support",
        stock=20,
    ),
    dict(
        name="Test Product",
        description="Test listing used to verify checkout, shipping, and payment flows end-to-end.",
        price=1.00,
        image_url="https://images.unsplash.com/photo-1581093458791-9d42e3c8e0f9?auto=format&fit=crop&q=80&w=600",
        is_best_selling=False,
        is_discounted=False,
        discount_price=None,
        category="Test",
        stock=999,
    ),
]


class Command(BaseCommand):
    help = "Seeds the database with the default admin account and starter product catalog."

    def handle(self, *args, **options):
        if not Product.objects.exists():
            for p in SEED_PRODUCTS:
                Product.objects.create(**p)
            self.stdout.write(self.style.SUCCESS(f"Seeded {len(SEED_PRODUCTS)} products."))
        else:
            self.stdout.write("Products already exist — skipping product seed.")

        if not AdminUser.objects.exists():
            AdminUser.objects.create(
                username=settings.DEFAULT_ADMIN_USERNAME,
                password_hash=make_password(settings.DEFAULT_ADMIN_PASSWORD),
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created default admin '{settings.DEFAULT_ADMIN_USERNAME}'. "
                    "Change this password immediately after first login."
                )
            )
        else:
            self.stdout.write("Admin user already exists — skipping admin seed.")

        if not Activity.objects.exists():
            Activity.objects.create(
                type="system_init",
                description="Glow State Peptides database initialized with premium seed products.",
            )

        details = PaymentDetails.load()
        if not details.account_number or details.account_number == "10013757":
            details.bank_name = "Commonwealth Bank"
            details.account_name = "Glow State"
            details.bsb = "064 437"
            details.account_number = "10013757"
            details.paypal_email = "Glowstatepeps@hotmail.com"
            details.paypal_client_id = settings.PAYPAL_CLIENT_ID
            details.save()
            self.stdout.write(self.style.SUCCESS("Seeded default payment details."))
