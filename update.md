1. Add an organization_id to every business collection

This is the most important change.

Without it, you can't separate one company's data from another's.

Users
Attribute	Type	Required	Notes
id	String	✅	Max 36, Unique
organization_id	String	✅	Max 36
email	Email	✅	Unique
role	Enum	✅	super_admin, admin, sales
display_name	String	✅	Max 80
contact	String	Optional	Max 20
created_at	Datetime	✅	
Customers
Attribute	Type	Required	Notes
id	String	✅	Max 36
organization_id	String	✅	Max 36
name	String	✅	Max 120
contractor	String	Optional	Max 120
pin	String	✅	Length 4
created_at	Datetime	✅	
Sales
Attribute	Type	Required	Notes
id	String	✅	Max 36
organization_id	String	✅	Max 36
type	Enum	✅	customer, visitor
customer_id	String	Optional	Max 36
customer_name	String	Required	Max 120
contractor	String	Optional	Max 120
food_type	Enum	Required	soft, hard, visitor
amount	Number	Required	
agent_id	String	Required	Max 36
agent_name	String	Required	Max 80
created_at	Datetime	Required	

2. Add an Organizations collection

Every company that buys your software becomes one record.

Attribute	Type
id	String
name	String
address	String
phone	String
email	Email
subscription	Enum (trial, basic, premium)
status	Enum (active, inactive)
created_at	Datetime

Example

Organization
Indorama
Julius Berger
Dangote Cement
    
3. ORGANIZATION CODE
id                  String      Required  Unique
organization_name   String      Required  Max 120
company_code        String      Required  Unique, Max 20
address             String      Optional  Max 255
phone               String      Optional  Max 20
email               Email       Optional  Max 254
subscription        Enum        Required  trial | basic | premium | enterprise
status              Enum        Required  active | inactive | suspended
max_users           Integer     Required
admin_user_id       String      Required  Max 36
created_by          String      Required  Max 36
created_at          Datetime    Required
updated_at          Datetime    Required
expires_at          Datetime    Optional


/register-organization