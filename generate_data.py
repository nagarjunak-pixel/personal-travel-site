import csv
import os
import json
import reverse_geocoder as rg

# Map country codes to country names
CC = {
    'IN':'India','MV':'Maldives','AT':'Austria','ZA':'South Africa','VN':'Vietnam',
    'FI':'Finland','CZ':'Czechia','QA':'Qatar','IT':'Italy','TH':'Thailand',
    'AE':'United Arab Emirates','MX':'Mexico','PL':'Poland','CO':'Colombia',
    'NO':'Norway','BR':'Brazil','US':'United States','GB':'United Kingdom',
    'FR':'France','DE':'Germany','ES':'Spain','SG':'Singapore','LK':'Sri Lanka',
    'NP':'Nepal','BT':'Bhutan','BD':'Bangladesh','MY':'Malaysia','ID':'Indonesia',
    'JP':'Japan','CN':'China','HK':'Hong Kong','KR':'South Korea','TR':'Turkey',
    'EG':'Egypt','KE':'Kenya','TZ':'Tanzania','AU':'Australia','NZ':'New Zealand',
    'CA':'Canada','AR':'Argentina','PE':'Peru','CL':'Chile','PT':'Portugal',
    'NL':'Netherlands','BE':'Belgium','CH':'Switzerland','SE':'Sweden','DK':'Denmark',
    'GR':'Greece','HU':'Hungary','RU':'Russia','SA':'Saudi Arabia','OM':'Oman',
    'KW':'Kuwait','BH':'Bahrain','PH':'Philippines','KH':'Cambodia','LA':'Laos',
    'MM':'Myanmar','IE':'Ireland','IS':'Iceland','HR':'Croatia','RO':'Romania',
    'BG':'Bulgaria','SK':'Slovakia','SI':'Slovenia','EE':'Estonia','LV':'Latvia',
    'LT':'Lithuania','UA':'Ukraine','MA':'Morocco','ZW':'Zimbabwe','MU':'Mauritius',
    'SC':'Seychelles','FJ':'Fiji','MT':'Malta','CY':'Cyprus','LU':'Luxembourg',
    'GE':'Georgia','CR':'Costa Rica','JO':'Jordan','BS':'Bahamas','VA':'Vatican City',
    'PA':'Panama','CU':'Cuba','DO':'Dominican Republic','SV':'El Salvador',
    'GT':'Guatemala','AL':'Albania','PS':'Palestine','JM':'Jamaica','PY':'Paraguay',
    'PK':'Pakistan','ET':'Ethiopia','IQ':'Iraq','BO':'Bolivia','SZ':'Eswatini',
}

# Reverse country mapping (Name -> CC)
CC_REV = {v.lower(): k for k, v in CC.items()}
CC_REV['united states'] = 'US'
CC_REV['united kingdom'] = 'GB'
CC_REV['vietnam'] = 'VN'
CC_REV['czechia'] = 'CZ'

def main():
    print("Loading reverse_geocoder database...")
    db_path = os.path.join(os.path.dirname(rg.__file__), 'rg_cities1000.csv')
    db = {}
    with open(db_path, 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            cc = row['cc'].lower()
            admin1 = row['admin1'].lower()
            name = row['name'].lower()
            # Try specific key: (cc, admin1, name)
            db[(cc, admin1, name)] = (float(row['lat']), float(row['lon']))
            # Try fallback: (cc, name)
            if (cc, name) not in db:
                db[(cc, name)] = (float(row['lat']), float(row['lon']))

    # Load locations
    print("Parsing All_Locations_CORRECTED.csv...")
    cities = []
    countries_dict = {}
    total_photos = 0

    with open('data/All_Locations_CORRECTED.csv', 'r') as f:
        reader = csv.DictReader(f)
        for row in reader:
            country = row['Country']
            region = row['Region']
            city = row['City']
            photos = int(row['Photos'])
            pct = float(row['Pct_of_GPS'].replace('%', ''))
            first = row['First']
            last = row['Last']
            
            cc = CC_REV.get(country.lower(), '').lower()
            
            # Lookup coordinate
            coord = db.get((cc, region.lower(), city.lower()))
            if not coord:
                coord = db.get((cc, city.lower()))
            
            lat, lon = coord if coord else (0.0, 0.0)
            
            cities.append({
                'city': city,
                'region': region,
                'country': country,
                'photos': photos,
                'pct': pct,
                'first': first,
                'last': last,
                'lat': lat,
                'lon': lon
            })
            
            total_photos += photos
            
            # Accumulate country summary
            if country not in countries_dict:
                countries_dict[country] = {
                    'country': country,
                    'photos': 0,
                    'cities_visited': 0,
                    'first': first,
                    'last': last
                }
            
            countries_dict[country]['photos'] += photos
            countries_dict[country]['cities_visited'] += 1
            if first < countries_dict[country]['first']:
                countries_dict[country]['first'] = first
            if last > countries_dict[country]['last']:
                countries_dict[country]['last'] = last

    # Convert countries summary to list and calculate %
    countries = []
    for country, details in countries_dict.items():
        details['pct'] = round((details['photos'] / total_photos) * 100, 2)
        countries.append(details)
    countries.sort(key=lambda x: x['photos'], reverse=True)

    # Load Instagram Posting Queue
    print("Parsing Instagram_Posting_Queue.csv...")
    queue = []
    if os.path.exists('data/Instagram_Posting_Queue.csv'):
        with open('data/Instagram_Posting_Queue.csv', 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                queue.append({
                    'rank': int(row['rank']),
                    'country': row['country'],
                    'region': row['region'],
                    'place': row['place'],
                    'date': row['date'],
                    'score': float(row['apple_score']),
                    'photo_path': row['photo_path']
                })

    # Load Instagram Ready Posts (the 9 JPGs with captions)
    print("Loading Instagram Ready Posts...")
    ready_posts = []
    posts_dir = 'public/Instagram_Ready_Posts'
    if os.path.exists(posts_dir):
        files = os.listdir(posts_dir)
        # Find all JPGs
        jpg_files = sorted([f for f in files if f.endswith('.jpg')])
        for f in jpg_files:
            prefix = f.split('.')[0]
            name = prefix.split('_')[-1]
            caption_file = os.path.join(posts_dir, f"{prefix}_caption.txt")
            caption = ""
            if os.path.exists(caption_file):
                with open(caption_file, 'r') as cap_f:
                    caption = cap_f.read().strip()
            
            ready_posts.append({
                'id': prefix,
                'name': name,
                'image_url': f"public/Instagram_Ready_Posts/{f}",
                'caption': caption
            })

    # Combine everything into one JSON file
    travel_data = {
        'total_photos': total_photos,
        'country_count': len(countries),
        'city_count': len(cities),
        'countries': countries,
        'cities': cities,
        'queue': queue,
        'prepared_posts': ready_posts
    }

    with open('data/travel_data.json', 'w') as f:
        json.dump(travel_data, f, indent=2)
    
    print("Successfully exported all geocoded travel data to data/travel_data.json!")

if __name__ == '__main__':
    main()
