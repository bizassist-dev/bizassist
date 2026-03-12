// BizAssist_mobile
// path: src/shared/fieldLimits.ts

export const FIELD_LIMITS = {
	email: 100,
	password: 128,
	passwordMin: 8,
	firstName: 50,
	firstNameMin: 2,
	middleName: 50,
	lastName: 50,
	lastNameMin: 2,
	phone: 40,
	businessName: 120,
	businessNameMin: 2,
	timezone: 64,
	timezoneMin: 3,

	// products
	productName: 120,
	productNameMin: 2,
	posTileLabel: 5,
	posTileLabelMin: 2,
	productDescription: 500,
	sku: 64,
	skuMin: 1,
	barcode: 64,
	barcodeMin: 1,

	// inventory numeric inputs (string length caps)
	// UDQI governance (FINAL):
	// - Hard cap of 18 chars for quantity-like inputs (Initial on hand, Reorder point, Adjust quantity).
	// - No blur padding; submit-time normalization only.
	reorderPoint: 18,
	initialOnHand: 18,
	quantity: 18,

	// categories
	// Keeps long names readable in two-line UI surfaces without truncating common cases.
	categoryName: 60,
	categoryNameMin: 1,

	// units
	unitName: 80,
	unitNameMin: 2,
	unitAbbreviation: 5, // ✅ LOCKED
	unitAbbreviationMin: 1,
	unitCatalogIdMin: 1,

	// options
	optionValuesPerSet: 30,
	modifierSetName: 120,
	modifierSetNameMin: 1,
	modifierName: 120,
	modifierNameMin: 1,

	// discounts
	discountName: 120,
	discountNameMin: 1,
	discountNote: 200,
	discountPercent: 3,
	discountAmount: 16,

	// taxes
	salesTaxPercent: 3,

	// common UX
	search: 80,
	note: 255,
	searchBarcode: 64,

	// pricing inputs (string length)
	price: 5,
	cost: 16,

	// OTP
	otpCode: 6,
	otpCell: 1,
	otpCellAndroid: 2,

	// server/shared
	idempotencyKey: 128,
	idempotencyKeyMin: 12,
	refreshToken: 5000,
	refreshTokenMin: 20,
	deviceId: 128,
	deviceIdMin: 8,
	resetTicket: 500,
	resetTicketMin: 10,
	mediaBucket: 80,
	mediaBucketMin: 1,
	mediaPath: 300,
	mediaPathMin: 1,
	mediaMimeType: 80,
	countryCode: 2,
	currencyCode: 3,
	jwtSecretMin: 16,
	countryNameScoreMax: 40,
} as const;
